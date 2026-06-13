const shellCache = "bakhaw-learner-shell-20260613-learner-counts";
const shellFiles = [
  "/teacher-login",
  "/teacher-login.html",
  "/teacher-login.css?v=20260613-2",
  "/teacher-login.js?v=20260613-login-fix",
  "/learner-offline.js?v=20260613-login-fix",
  "/learner-manifest.webmanifest",
  "/teacher-session.js?v=20260613-online",
  "/students",
  "/students.html",
  "/students.css?v=20260613-learner-counts",
  "/students.js?v=20260613-learner-counts",
  "/student-dashboard",
  "/student-dashboard.html",
  "/student-dashboard.css?v=20260613-status-labels",
  "/student-dashboard.js?v=20260613-online",
  "/bakhaw-school-logo.png"
];

self.addEventListener("install", event=>{
  event.waitUntil(caches.open(shellCache).then(cache=>cache.addAll(shellFiles)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate", event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith("bakhaw-learner-shell-") && key !== shellCache).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

async function cachedShell(request, fallback){
  const cache = await caches.open(shellCache);
  try{
    const response = await fetch(request);
    if(response.ok){
      cache.put(request, response.clone());
    }
    return response;
  }catch{
    return await cache.match(request, { ignoreSearch:true })
      || await cache.match(fallback, { ignoreSearch:true })
      || new Response("This page has not been prepared for offline use yet.", {
        status:503,
        headers:{ "Content-Type":"text/plain; charset=utf-8" }
      });
  }
}

self.addEventListener("fetch", event=>{
  if(event.request.method !== "GET"){
    return;
  }

  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin){
    return;
  }

  if(url.pathname === "/teacher-login" || url.pathname === "/students" || url.pathname === "/student-dashboard"){
    event.respondWith(cachedShell(event.request, url.pathname));
    return;
  }

  if(shellFiles.some(file=>new URL(file, self.location.origin).pathname === url.pathname)){
    event.respondWith(cachedShell(event.request, url.pathname));
  }
});
