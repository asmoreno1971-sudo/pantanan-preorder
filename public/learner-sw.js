const shellCache = "bakhaw-learner-shell-20260618-saved-profile-hydration";
const shellFiles = [
  "/teacher-login",
  "/teacher-login.html",
  "/teacher-login.css?v=20260614-hide-guidance-name",
  "/teacher-login.js?v=20260616-current-teacher",
  "/learner-offline.js?v=20260617-offline-pages",
  "/learner-manifest.webmanifest",
  "/teacher-session.css?v=20260613-self-pin",
  "/teacher-session.css?v=20260615-guidance-pin-gate",
  "/teacher-session.js?v=20260616-current-teacher",
  "/students-offline-shell",
  "/students.css?v=20260617-header-polish",
  "/students.js?v=20260615-live-fresh-offline",
  "/personnel-offline-shell",
  "/personnel.css?v=20260617-hide-default-list",
  "/personnel.js?v=20260617-column-b-options",
  "/personnel-profile-offline-shell",
  "/personnel-profile.css?v=20260617-prc-expiry-years",
  "/personnel-profile.js?v=20260618-saved-profile-hydration",
  "/student-dashboard-offline-shell",
  "/student-dashboard.css?v=20260616-personnel-consol",
  "/student-dashboard.js?v=20260617-console-password",
  "/guidance-offline-shell",
  "/guidance.css?v=20260614-hover-actions",
  "/guidance.js?v=20260617-typable-learners",
  "/guidance-report-offline-shell",
  "/guidance-report.css?v=20260615-report-level-colors",
  "/guidance-report.js?v=20260615-live-fresh-offline",
  "/teacher-accounts-offline-shell",
  "/teacher-accounts.css?v=20260614-page-password",
  "/teacher-accounts.js?v=20260615-no-loading-waits",
  "/bakhaw-school-logo.png"
];

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

const publicPages = {
  "/teacher-login":"/teacher-login",
  "/teacher-login.html":"/teacher-login.html"
};

function isShellAsset(pathname){
  return shellFiles.some(file=>new URL(file, self.location.origin).pathname === pathname);
}

function isStaticAsset(pathname){
  return /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|json|webmanifest)$/i.test(pathname);
}

async function cachedOrNetwork(request, cacheKey){
  const cache = await caches.open(shellCache);
  const cached = await cache.match(request, { ignoreSearch:true })
    || await cache.match(cacheKey || new URL(request.url).pathname, { ignoreSearch:true });
  if(cached){
    return cached;
  }
  const response = await fetch(request);
  if(response.ok && !response.redirected){
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkThenCache(request, cacheKey){
  const cache = await caches.open(shellCache);
  try{
    const response = await fetch(request);
    if(response.ok && !response.redirected){
      await cache.put(cacheKey || new URL(request.url).pathname, response.clone());
    }
    return response;
  }catch{
    const cached = await cache.match(cacheKey || request, { ignoreSearch:true })
      || await cache.match(request, { ignoreSearch:true });
    if(cached){
      return cached;
    }
    throw new Error("No cached response is available.");
  }
}

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

  const offlineShell = protectedShells[url.pathname];
  if(offlineShell){
    event.respondWith((async ()=>{
      const cache = await caches.open(shellCache);
      try{
        const response = await fetch(event.request);
        if(response.ok && !response.redirected){
          await cache.put(url.pathname,response.clone());
          return response;
        }
      }catch{
        const cachedShell = await cache.match(offlineShell,{ignoreSearch:true});
        if(cachedShell){
          return cachedShell;
        }
      }
      return await cache.match(offlineShell,{ignoreSearch:true})
        || new Response("Open and sign in to this app once with internet before using this page offline.", {
          status:503,
          headers:{ "Content-Type":"text/plain; charset=utf-8" }
        });
    })());
    return;
  }

  const publicPage = publicPages[url.pathname];
  if(publicPage){
    event.respondWith((async ()=>{
      try{
        return await networkThenCache(event.request, publicPage);
      }catch{
        return new Response("Open this app once with internet before using this page offline.", {
          status:503,
          headers:{ "Content-Type":"text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  if(isShellAsset(url.pathname) || isStaticAsset(url.pathname)){
    event.respondWith(cachedOrNetwork(event.request, url.pathname));
  }
});
