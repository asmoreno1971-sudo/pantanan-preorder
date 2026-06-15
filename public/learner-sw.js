const shellCache = "bakhaw-learner-shell-20260615-adviser-names";
const shellFiles = [
  "/teacher-login",
  "/teacher-login.html",
  "/teacher-login.css?v=20260614-hide-guidance-name",
  "/teacher-login.js?v=20260615-guidance-route",
  "/learner-offline.js?v=20260615-guidance-route",
  "/learner-manifest.webmanifest",
  "/teacher-session.css?v=20260613-self-pin",
  "/teacher-session.js?v=20260614-guidance-admin",
  "/students",
  "/students.html",
  "/students.css?v=20260614-sticky-table",
  "/students.js?v=20260614-instant-offline-all",
  "/student-dashboard",
  "/student-dashboard.html",
  "/student-dashboard.css?v=20260614-half-summary",
  "/student-dashboard.js?v=20260614-instant-cache",
  "/guidance",
  "/guidance.html",
  "/guidance.css?v=20260614-hover-actions",
  "/guidance.js?v=20260615-adviser-names",
  "/teacher-accounts",
  "/teacher-accounts.html",
  "/teacher-accounts.css?v=20260614-page-password",
  "/teacher-accounts.js?v=20260614-offline-shell",
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

  if(["/guidance", "/guidance.html"].includes(url.pathname)){
    event.respondWith((async ()=>{
      const cache = await caches.open(shellCache);
      const cached = await cache.match(event.request, { ignoreSearch:true })
        || await cache.match("/guidance", { ignoreSearch:true });
      const cachedPath = cached?.url ? new URL(cached.url).pathname : "";
      const validCachedGuidance = cached
        && !cached.redirected
        && !["/teacher-login", "/teacher-login.html"].includes(cachedPath);
      if(validCachedGuidance){
        return cached;
      }
      try{
        const response = await fetch(event.request);
        if(response.ok && !response.redirected){
          await Promise.all([
            cache.put("/guidance", response.clone()),
            cache.put("/guidance.html", response.clone())
          ]);
        }
        return response;
      }catch{
        return new Response("Guidance must be opened online once after a successful Guidance Admin login.", {
          status:503,
          headers:{ "Content-Type":"text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  const pagePaths = ["/teacher-login", "/students", "/student-dashboard", "/guidance", "/teacher-accounts"];
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
