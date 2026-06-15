(function(){
  const databaseName = "bakhaw-learner-offline-v1";
  const databaseVersion = 2;
  const recordsStore = "records";
  const changesStore = "pending-changes";
  const guidanceCasesStore = "guidance-cases";
  const guidanceChangesStore = "pending-guidance-changes";
  const metaStore = "meta";
  const recordOrderKey = "student-record-order";

  function openDatabase(){
    return new Promise((resolve, reject)=>{
      const request = indexedDB.open(databaseName, databaseVersion);

      request.onupgradeneeded = ()=>{
        const db = request.result;
        if(!db.objectStoreNames.contains(recordsStore)){
          db.createObjectStore(recordsStore, { keyPath:"id" });
        }
        if(!db.objectStoreNames.contains(changesStore)){
          db.createObjectStore(changesStore, { keyPath:"changeId" });
        }
        if(!db.objectStoreNames.contains(guidanceCasesStore)){
          db.createObjectStore(guidanceCasesStore, { keyPath:"id" });
        }
        if(!db.objectStoreNames.contains(guidanceChangesStore)){
          db.createObjectStore(guidanceChangesStore, { keyPath:"changeId" });
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

  function uuid(){
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function replaceRecords(records){
    const db = await openDatabase();
    return new Promise((resolve, reject)=>{
      const transaction = db.transaction([recordsStore, metaStore], "readwrite");
      const recordStore = transaction.objectStore(recordsStore);
      const cleanRecords = Array.isArray(records) ? records : [];
      recordStore.clear();
      cleanRecords.forEach(record=>recordStore.put(record));
      transaction.objectStore(metaStore).put(cleanRecords.map(record=>record.id), recordOrderKey);
      transaction.oncomplete = ()=>{ db.close(); resolve(); };
      transaction.onerror = ()=>{ db.close(); reject(transaction.error); };
    });
  }

  async function loadRecords(){
    const [records, order] = await Promise.all([
      useStore(recordsStore, "readonly", store=>store.getAll()),
      useStore(metaStore, "readonly", store=>store.get(recordOrderKey))
    ]);
    const positions = new Map((Array.isArray(order) ? order : []).map((id, index)=>[id, index]));
    return records.sort((a, b)=>
      (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER)
      - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  async function saveRecord(record){
    const records = await loadRecords();
    const index = records.findIndex(item=>item.id === record.id);
    if(index >= 0){
      records[index] = record;
    }else{
      records.unshift(record);
    }
    await replaceRecords(records);
  }

  async function removeRecord(id){
    const records = await loadRecords();
    await replaceRecords(records.filter(record=>record.id !== id));
  }

  async function queueChange(method, record){
    const id = String(record.id || uuid());
    const change = {
      changeId:`${Date.now()}-${uuid()}`,
      method,
      id,
      record:{ ...record, id },
      queuedAt:new Date().toISOString()
    };
    await useStore(changesStore, "readwrite", store=>store.put(change));
    return change;
  }

  async function pendingChanges(){
    const changes = await useStore(changesStore, "readonly", store=>store.getAll());
    return changes.sort((a, b)=>String(a.queuedAt).localeCompare(String(b.queuedAt)));
  }

  async function removeChange(changeId){
    await useStore(changesStore, "readwrite", store=>store.delete(changeId));
  }

  async function pendingCount(){
    return useStore(changesStore, "readonly", store=>store.count());
  }

  async function replaceGuidanceCases(cases){
    const db = await openDatabase();
    return new Promise((resolve, reject)=>{
      const transaction = db.transaction(guidanceCasesStore, "readwrite");
      const store = transaction.objectStore(guidanceCasesStore);
      store.clear();
      (Array.isArray(cases) ? cases : []).forEach(guidanceCase=>store.put(guidanceCase));
      transaction.oncomplete = ()=>{ db.close(); resolve(); };
      transaction.onerror = ()=>{ db.close(); reject(transaction.error); };
    });
  }

  async function loadGuidanceCases(){
    const guidanceCases = await useStore(guidanceCasesStore, "readonly", store=>store.getAll());
    return guidanceCases.sort((a, b)=>
      String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
    );
  }

  async function saveGuidanceCase(guidanceCase){
    await useStore(guidanceCasesStore, "readwrite", store=>store.put(guidanceCase));
  }

  async function removeGuidanceCase(id){
    await useStore(guidanceCasesStore, "readwrite", store=>store.delete(id));
  }

  async function queueGuidanceChange(method, guidanceCase){
    const id = String(guidanceCase.id || uuid());
    const changes = await pendingGuidanceChanges();
    const existing = changes.find(change=>change.id === id);

    if(existing){
      if(existing.method === "POST"){
        if(method === "DELETE"){
          await removeGuidanceChange(existing.changeId);
          return null;
        }
        existing.record = { ...guidanceCase, id };
        existing.queuedAt = new Date().toISOString();
        await useStore(guidanceChangesStore, "readwrite", store=>store.put(existing));
        return existing;
      }
      await removeGuidanceChange(existing.changeId);
    }

    const change = {
      changeId:`${Date.now()}-${uuid()}`,
      method,
      id,
      record:{ ...guidanceCase, id },
      queuedAt:new Date().toISOString()
    };
    await useStore(guidanceChangesStore, "readwrite", store=>store.put(change));
    return change;
  }

  async function pendingGuidanceChanges(){
    const changes = await useStore(guidanceChangesStore, "readonly", store=>store.getAll());
    return changes.sort((a, b)=>String(a.queuedAt).localeCompare(String(b.queuedAt)));
  }

  async function removeGuidanceChange(changeId){
    await useStore(guidanceChangesStore, "readwrite", store=>store.delete(changeId));
  }

  async function pendingGuidanceCount(){
    return useStore(guidanceChangesStore, "readonly", store=>store.count());
  }

  async function digest(value){
    const bytes = new TextEncoder().encode(String(value));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2, "0")).join("");
  }

  async function rememberCredentials(username, pin){
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const verifier = await digest(`${normalizedUsername}:${pin}:bakhaw-offline-login`);
    await useStore(metaStore, "readwrite", store=>store.put({
      username:normalizedUsername,
      verifier,
      savedAt:new Date().toISOString()
    }, `teacher-credentials:${normalizedUsername}`));
  }

  async function verifyCredentials(username, pin){
    const normalizedUsername = String(username || "").trim().toLowerCase();
    const saved = await useStore(metaStore, "readonly", store=>store.get(`teacher-credentials:${normalizedUsername}`))
      || await useStore(metaStore, "readonly", store=>store.get("teacher-credentials"));
    if(!saved || saved.username !== normalizedUsername){
      return false;
    }
    return saved.verifier === await digest(`${normalizedUsername}:${pin}:bakhaw-offline-login`);
  }

  function setOfflineSession(accepted){
    sessionStorage.setItem("bakhawOfflineTeacher", accepted ? "accepted" : "pending");
  }

  function hasOfflineSession(){
    return sessionStorage.getItem("bakhawOfflineTeacher") === "accepted";
  }

  function clearOfflineSession(){
    sessionStorage.removeItem("bakhawOfflineTeacher");
    sessionStorage.removeItem("bakhawGuidanceAdmin");
  }

  function setGuidanceSession(accepted){
    sessionStorage.setItem("bakhawGuidanceAdmin", accepted ? "accepted" : "pending");
  }

  function hasGuidanceSession(){
    return sessionStorage.getItem("bakhawGuidanceAdmin") === "accepted";
  }

  async function registerServiceWorker(){
    if("serviceWorker" in navigator){
      const registration = await navigator.serviceWorker.register("/learner-sw.js?v=20260615-offline-login-fast", { scope:"/" });
      await registration.update();
      const worker = registration.installing || registration.waiting || registration.active;
      if(worker && worker.state !== "activated"){
        await new Promise(resolve=>{
          const timeout = window.setTimeout(resolve, 15000);
          worker.addEventListener("statechange", ()=>{
            if(worker.state === "activated" || worker.state === "redundant"){
              window.clearTimeout(timeout);
              resolve();
            }
          });
        });
      }
      await navigator.serviceWorker.ready;
    }
  }

  window.LearnerOffline = {
    uuid,
    replaceRecords,
    loadRecords,
    saveRecord,
    removeRecord,
    queueChange,
    pendingChanges,
    removeChange,
    pendingCount,
    replaceGuidanceCases,
    loadGuidanceCases,
    saveGuidanceCase,
    removeGuidanceCase,
    queueGuidanceChange,
    pendingGuidanceChanges,
    removeGuidanceChange,
    pendingGuidanceCount,
    rememberCredentials,
    verifyCredentials,
    setOfflineSession,
    hasOfflineSession,
    setGuidanceSession,
    hasGuidanceSession,
    clearOfflineSession,
    registerServiceWorker
  };
})();
