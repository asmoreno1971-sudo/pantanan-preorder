const cacheName = "roadworthy-cashier-shell-20260602";
const shellFiles = [
  "/cashier",
  "/cashier.html",
  "/styles.css?v=20260602-offline-cashier",
  "/page-auth.js?v=20260522-password-1111",
  "/cashier-offline.js?v=20260602-offline-cashier",
  "/app.js?v=20260602-offline-cashier"
];

self.addEventListener("install", event=>{
  event.waitUntil(
    caches.open(cacheName)
      .then(cache=>cache.addAll(shellFiles))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith("roadworthy-cashier-shell-") && key !== cacheName).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

async function networkFirst(request){
  const cache = await caches.open(cacheName);
  try{
    const response = await fetch(request);
    if(response.ok){
      cache.put(request, response.clone());
    }
    return response;
  }catch{
    return cache.match(request);
  }
}

self.addEventListener("fetch", event=>{
  const url = new URL(event.request.url);

  if(event.request.method !== "GET" || url.origin !== self.location.origin){
    return;
  }

  if(url.pathname === "/cashier" || url.pathname === "/cashier.html" || url.pathname === "/api/menu" || url.pathname === "/app.js" || url.pathname === "/styles.css" || url.pathname === "/page-auth.js" || url.pathname === "/cashier-offline.js"){
    event.respondWith(networkFirst(event.request));
    return;
  }

  if(url.pathname.startsWith("/api/menu-image/")){
    event.respondWith(
      caches.open(cacheName).then(async cache=>{
        const cached = await cache.match(event.request);
        if(cached){
          return cached;
        }
        const response = await fetch(event.request);
        if(response.ok){
          cache.put(event.request, response.clone());
        }
        return response;
      })
    );
  }
});
