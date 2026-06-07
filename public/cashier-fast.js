(function(){
  if(!isCashierPage || !cashierOffline){
    return;
  }

  const networkTimeoutMs = 3500;
  const firstMenuTimeoutMs = 8000;
  const backgroundSyncTimeoutMs = 45000;

  async function fetchWithTimeout(url, options = {}, timeoutMs = networkTimeoutMs){
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), timeoutMs);

    try{
      return await fetch(url, {
        ...options,
        signal:controller.signal
      });
    }finally{
      clearTimeout(timeout);
    }
  }

  async function showSavedMenu(){
    const savedMenu = await cashierOffline.loadMenu().catch(()=>[]);
    if(!savedMenu.length){
      return false;
    }

    const orderableMenu = savedMenu.filter(item=>item.available !== false);
    if(menuSignature(orderableMenu) !== menuSignature(menu)){
      menu = orderableMenu;
      renderMenu();
    }
    return true;
  }

  loadMenu = async function(){
    const hasSavedMenu = await showSavedMenu();

    try{
      const res = await fetchWithTimeout(
        "/api/menu?view=cashier",
        { cache:"no-store" },
        hasSavedMenu ? networkTimeoutMs : firstMenuTimeoutMs
      );
      const menuSource = res.headers.get("X-Menu-Source");
      const menuVersion = res.headers.get("X-Menu-Version");

      if(!res.ok || menuSource !== "admin-persistent-menu" || menuVersion !== requiredMenuVersion){
        throw new Error("Cashier menu source is unavailable");
      }

      const freshMenu = await res.json();
      if(!Array.isArray(freshMenu)){
        throw new Error("Cashier menu is invalid");
      }

      const orderableMenu = freshMenu.filter(item=>item.available !== false);
      await cashierOffline.saveMenu(orderableMenu);
      cashierOffline.cacheMenuImages(orderableMenu).catch(()=>{});

      if(menuSignature(orderableMenu) !== menuSignature(menu)){
        menu = orderableMenu;
        renderMenu();
      }
    }catch{
      if(!hasSavedMenu && !menu.length){
        menuList.innerHTML = `<div class="category-empty">Open Cashier once with internet to prepare offline mode.</div>`;
      }
    }
  };

  async function sendOrder(payload, timeoutMs){
    const res = await fetchWithTimeout("/api/orders", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(payload)
    }, timeoutMs);
    const data = await res.json();

    if(!res.ok && !data.ok){
      const error = new Error(data.message || "Unable to send order");
      error.responseData = data;
      error.permanent = res.status >= 400 && res.status < 500;
      throw error;
    }

    return data;
  }

  postOrder = async function(payload){
    return sendOrder(payload, networkTimeoutMs);
  };

  submitCashierOrder = async function(payload){
    const sale = {
      ...payload,
      clientTransactionId:cashierOffline.transactionId(),
      offlineQueuedAt:new Date().toISOString()
    };

    if(navigator.onLine && storageWriteReady){
      try{
        return await sendOrder(sale, networkTimeoutMs);
      }catch(error){
        if(error.permanent){
          throw error;
        }
      }
    }

    await cashierOffline.queueSale(sale);
    setTimeout(syncPendingCashierSales, 0);
    return { ok:true, queued:true };
  };

  syncPendingCashierSales = async function(){
    if(cashierSyncInFlight || !navigator.onLine){
      updateCashierOfflineUi();
      return;
    }

    const pending = await cashierOffline.pendingSales().catch(()=>[]);
    if(!pending.length){
      updateCashierOfflineUi();
      return;
    }

    cashierSyncInFlight = true;
    cashierSyncWarning = "";
    updateCashierOfflineUi("Sale is safe on this device. Syncing in the background...");
    let retryNeeded = false;

    try{
      for(const sale of pending){
        try{
          const data = await sendOrder(sale, backgroundSyncTimeoutMs);
          if(data.ok){
            await cashierOffline.removeSale(sale.clientTransactionId);
          }
        }catch(error){
          if(error.permanent){
            cashierSyncWarning = "A saved sale needs attention. It remains safely stored on this device.";
          }else{
            cashierSyncWarning = "Sale is saved locally. The online server is waking up; retrying automatically.";
            retryNeeded = true;
          }
          break;
        }
      }
    }finally{
      cashierSyncInFlight = false;
      updateCashierOfflineUi();
      if(retryNeeded){
        setTimeout(syncPendingCashierSales, 15000);
      }
    }
  };

  loadMenu();
  syncPendingCashierSales();
})();
