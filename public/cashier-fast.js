(function(){
  if(!isCashierPage || !cashierOffline){
    return;
  }

  const networkTimeoutMs = 3500;
  const firstMenuTimeoutMs = 8000;

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

  postOrder = async function(payload){
    const res = await fetchWithTimeout("/api/orders", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(payload)
    });
    const data = await res.json();

    if(!res.ok && !data.ok){
      const error = new Error(data.message || "Unable to send order");
      error.responseData = data;
      error.permanent = res.status >= 400 && res.status < 500;
      throw error;
    }

    return data;
  };

  loadMenu();
  syncPendingCashierSales();
})();
