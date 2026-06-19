(function(){
  const databaseName = "roadworthy-cashier-offline-v1";
  const databaseVersion = 1;
  const salesStore = "pending-sales";
  const metaStore = "meta";

  function openDatabase(){
    return new Promise((resolve, reject)=>{
      const request = indexedDB.open(databaseName, databaseVersion);

      request.onupgradeneeded = ()=>{
        const db = request.result;
        if(!db.objectStoreNames.contains(salesStore)){
          db.createObjectStore(salesStore, { keyPath:"clientTransactionId" });
        }
        if(!db.objectStoreNames.contains(metaStore)){
          db.createObjectStore(metaStore);
        }
      };
      request.onsuccess = ()=>resolve(request.result);
      request.onerror = ()=>reject(request.error);
    });
  }

  async function useStore(storeName, mode, action){
    const db = await openDatabase();
    return new Promise((resolve, reject)=>{
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = action(store);
      request.onsuccess = ()=>resolve(request.result);
      request.onerror = ()=>reject(request.error);
      transaction.oncomplete = ()=>db.close();
      transaction.onerror = ()=>reject(transaction.error);
    });
  }

  function transactionId(){
    if(crypto.randomUUID){
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function saveMenu(menu){
    await useStore(metaStore, "readwrite", store=>store.put({
      menu,
      savedAt:new Date().toISOString()
    }, "cashier-menu"));
  }

  async function loadMenu(){
    const record = await useStore(metaStore, "readonly", store=>store.get("cashier-menu"));
    return record && Array.isArray(record.menu) ? record.menu : [];
  }

  async function queueSale(payload){
    const sale = {
      ...payload,
      clientTransactionId:payload.clientTransactionId || transactionId(),
      offlineQueuedAt:payload.offlineQueuedAt || new Date().toISOString()
    };
    await useStore(salesStore, "readwrite", store=>store.put(sale));
    return sale;
  }

  async function pendingSales(){
    return useStore(salesStore, "readonly", store=>store.getAll());
  }

  async function removeSale(clientTransactionId){
    return useStore(salesStore, "readwrite", store=>store.delete(clientTransactionId));
  }

  async function countPending(){
    return useStore(salesStore, "readonly", store=>store.count());
  }

  async function registerServiceWorker(){
    if(!("serviceWorker" in navigator)){
      return;
    }
    await navigator.serviceWorker.register("/cashier-sw.js?v=current", { scope:"/" });
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active || registration.waiting || registration.installing;
    const appShellPaths = [
      "/", "/customer", "/admin", "/cashier", "/kitchen", "/sales", "/transaction", "/transactions", "/expenses", "/qr",
      "/login", "/teacher-login", "/student-dashboard", "/students", "/personnel", "/personnel-profile",
      "/guidance", "/guidance-report", "/teacher-accounts", "/teacher-profile", "/mineralex", "/mineralex/"
    ];
    worker?.postMessage({
      type:"CACHE_SHELL_URLS",
      urls:[
        window.location.href,
        ...appShellPaths.map(path=>new URL(path, window.location.origin).href),
        ...[...document.querySelectorAll("link[href], script[src], img[src]")]
          .map(element=>element.href || element.src)
          .filter(Boolean)
      ]
    });
  }

  async function cacheMenuImages(menu){
    if(!("serviceWorker" in navigator)){
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active || registration.waiting || registration.installing;
    if(!worker){
      return;
    }

    worker.postMessage({
      type:"CACHE_MENU_IMAGES",
      urls:(Array.isArray(menu) ? menu : [])
        .map(item=>String(item.image || ""))
        .filter(Boolean)
    });
  }

  window.CashierOffline = {
    transactionId,
    saveMenu,
    loadMenu,
    queueSale,
    pendingSales,
    removeSale,
    countPending,
    registerServiceWorker,
    cacheMenuImages
  };
})();
