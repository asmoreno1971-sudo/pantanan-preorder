(function(){
  const offlineHost = "bis1.onrender.com";
  const offlineEnabled = window.location.hostname.toLowerCase() === offlineHost;
  const appShellPaths = [
    "/", "/customer", "/admin", "/cashier", "/kitchen", "/sales", "/transaction", "/transactions", "/expenses", "/qr",
    "/login", "/teacher-login", "/student-dashboard", "/students", "/personnel", "/personnel-profile",
    "/guidance", "/guidance-report", "/teacher-accounts", "/teacher-profile", "/mineralex", "/mineralex/"
  ];

  function shellUrls(){
    const urls = new Set([window.location.href]);
    appShellPaths.forEach(path=>urls.add(new URL(path, window.location.origin).href));
    document.querySelectorAll("link[href], script[src], img[src]").forEach(element=>{
      const value = element.href || element.src;
      if(value){
        urls.add(value);
      }
    });
    return [...urls];
  }

  async function postShellUrls(registration){
    const readyRegistration = registration || await navigator.serviceWorker.ready;
    const worker = readyRegistration.active || readyRegistration.waiting || readyRegistration.installing;
    worker?.postMessage({ type:"CACHE_SHELL_URLS", urls:shellUrls() });
  }

  async function registerAppShell(){
    if(!("serviceWorker" in navigator)){
      return;
    }
    if(!offlineEnabled){
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter(registration=>/\/(?:learner|cashier)-sw\.js(?:\?|$)/.test(String(registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || "")))
        .map(registration=>registration.unregister()));
      return;
    }

    const registration = await navigator.serviceWorker.register("/learner-sw.js?v=current", { scope:"/" });
    await registration.update().catch(()=>{});
    await postShellUrls();
  }

  function refreshAppShell(){
    if(!offlineEnabled || !navigator.onLine){
      return;
    }
    postShellUrls().catch(()=>{});
  }

  registerAppShell().catch(()=>{});
  if(offlineEnabled){
    window.addEventListener("online", refreshAppShell);
    window.addEventListener("focus", refreshAppShell);
    window.addEventListener("pageshow", refreshAppShell);
  }
})();
