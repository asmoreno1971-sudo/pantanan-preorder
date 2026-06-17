const shellCache = "bakhaw-learner-shell-20260617-header-polish";
const shellFiles = [
  "/teacher-login",
  "/teacher-login.html",
  "/teacher-login.css?v=20260614-hide-guidance-name",
  "/teacher-login.js?v=20260616-current-teacher",
  "/learner-offline.js?v=20260615-guidance-pin-gate",
  "/learner-manifest.webmanifest",
  "/teacher-session.css?v=20260613-self-pin",
  "/teacher-session.js?v=20260616-current-teacher",
  "/students",
  "/students.html",
  "/students-offline-shell",
  "/students.css?v=20260617-header-polish",
  "/students.js?v=20260615-live-fresh-offline",
  "/personnel",
  "/personnel.html",
  "/personnel-offline-shell",
  "/personnel.css?v=20260617-hide-default-list",
  "/personnel.js?v=20260617-column-b-options",
  "/personnel-profile",
  "/personnel-profile.html",
  "/personnel-profile-offline-shell",
  "/personnel-profile.css?v=20260617-prc-expiry-years",
  "/personnel-profile.js?v=20260617-prc-expiry-years",
  "/student-dashboard",
  "/student-dashboard.html",
  "/student-dashboard-offline-shell",
  "/student-dashboard.css?v=20260616-personnel-consol",
  "/student-dashboard.js?v=20260617-console-password",
  "/guidance",
  "/guidance.html",
  "/guidance-offline-shell",
  "/guidance.css?v=20260614-hover-actions",
  "/guidance.js?v=20260617-typable-learners",
  "/guidance-report",
  "/guidance-report.html",
  "/guidance-report-offline-shell",
  "/guidance-report.css?v=20260615-report-level-colors",
  "/guidance-report.js?v=20260615-live-fresh-offline",
  "/teacher-accounts",
  "/teacher-accounts.html",
  "/teacher-accounts-offline-shell",
  "/teacher-accounts.css?v=20260614-page-password",
  "/teacher-accounts.js?v=20260615-no-loading-waits",
  "/bakhaw-school-logo.png"
];

self.addEventListener("install", event=>{
  event.waitUntil(
    caches.open(shellCache)
      .then(cache=>Promise.allSettled(shellFiles.map(file=>cache.add(file))))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith("bakhaw-learner-shell-") && key !== shellCache).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch", event=>{
  if(event.request.method !== "GET"){
    return;
  }

  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin){
    return;
  }

  const protectedShells = {
    "/students":"/students-offline-shell",
    "/students.html":"/students-offline-shell",
    "/personnel":"/personnel-offline-shell",
    "/personnel.html":"/personnel-offline-shell",
    "/personnel-profile":"/personnel-profile-offline-shell",
    "/personnel-profile.html":"/personnel-profile-offline-shell",
    "/student-dashboard":"/student-dashboard-offline-shell",
    "/student-dashboard.html":"/student-dashboard-offline-shell",
    "/guidance":"/guidance-offline-shell",
    "/guidance.html":"/guidance-offline-shell",
    "/guidance-report":"/guidance-report-offline-shell",
    "/guidance-report.html":"/guidance-report-offline-shell",
    "/teacher-accounts":"/teacher-accounts-offline-shell",
    "/teacher-accounts.html":"/teacher-accounts-offline-shell"
  };
  const offlineShell = protectedShells[url.pathname];
  if(offlineShell){
    event.respondWith((async ()=>{
      const cache = await caches.open(shellCache);
      const candidates = [
        await cache.match(event.request,{ignoreSearch:true}),
        await cache.match(url.pathname,{ignoreSearch:true}),
        await cache.match(offlineShell,{ignoreSearch:true})
      ].filter(Boolean);
      const validCachedPage = candidates.find(response=>{
        const cachedPath = response.url ? new URL(response.url).pathname : "";
        return !response.redirected && !["/teacher-login","/teacher-login.html"].includes(cachedPath);
      });
      if(validCachedPage){
        return validCachedPage;
      }
      try{
        const response = await fetch(event.request);
        if(response.ok && !response.redirected){
          await cache.put(url.pathname,response.clone());
        }
        return response;
      }catch{
        return new Response("Open and sign in to this app once with internet before using this page offline.", {
          status:503,
          headers:{ "Content-Type":"text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  const pagePaths = ["/teacher-login"];
  if(pagePaths.includes(url.pathname)){
    event.respondWith((async ()=>{
      const cache = await caches.open(shellCache);
      const cached = await cache.match(event.request, { ignoreSearch:true })
        || await cache.match(url.pathname, { ignoreSearch:true });
      if(cached){
        return cached;
      }
      try{
        return await fetch(event.request);
      }catch{
        return new Response("This page has not been prepared for offline use yet.", {
          status:503,
          headers:{ "Content-Type":"text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  if(shellFiles.some(file=>new URL(file, self.location.origin).pathname === url.pathname)){
    event.respondWith((async ()=>{
      const cache = await caches.open(shellCache);
      const cached = await cache.match(event.request, { ignoreSearch:true })
        || await cache.match(url.pathname, { ignoreSearch:true });
      if(cached){
        return cached;
      }
      return fetch(event.request);
    })());
  }
});
