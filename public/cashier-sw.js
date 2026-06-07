const cacheName = "roadworthy-cashier-shell-20260607";
const imageCacheName = "roadworthy-cashier-images-v1";
const shellFiles = [
  "/cashier",
  "/cashier.html",
  "/styles.css?v=20260607-fast-offline-cashier",
  "/page-auth.js?v=20260522-password-1111",
  "/cashier-offline.js?v=20260607-fast-offline-cashier",
  "/app.js?v=20260607-fast-offline-cashier",
  "/cashier-fast.js?v=20260607-fast-offline-cashier"
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
    caches.keys().then(async keys=>{
      const imageCache = await caches.open(imageCacheName);
      const oldShells = keys.filter(key=>key.startsWith("roadworthy-cashier-shell-") && key !== cacheName);

      for(const key of oldShells){
        const oldCache = await caches.open(key);
        const requests = await oldCache.keys();
        for(const request of requests){
          if(new URL(request.url).pathname.startsWith("/api/menu-image/")){
            const response = await oldCache.match(request);
            if(response){
              await imageCache.put(request, response);
            }
          }
        }
        await caches.delete(key);
      }
    })
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message", event=>{
  if(!event.data || event.data.type !== "CACHE_MENU_IMAGES"){
    return;
  }

  const urls = (Array.isArray(event.data.urls) ? event.data.urls : [])
    .map(value=>{
      try{
        return new URL(value, self.location.origin);
      }catch{
        return null;
      }
    })
    .filter(url=>url && url.origin === self.location.origin && url.pathname.startsWith("/api/menu-image/"))
    .map(url=>url.href);

  event.waitUntil((async ()=>{
    const cache = await caches.open(imageCacheName);
    const keep = new Set(urls);
    const existing = await cache.keys();
    await Promise.all(existing
      .filter(request=>!keep.has(request.url))
      .map(request=>cache.delete(request)));

    for(const url of urls){
      if(await cache.match(url)){
        continue;
      }
      try{
        const response = await fetch(url);
        if(response.ok){
          await cache.put(url, response);
        }
      }catch{
        // Keep the rest of the menu usable when an image is temporarily unavailable.
      }
    }
  })());
});

async function staleWhileRevalidate(event, fallbackUrl){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request, { ignoreSearch:true })
    || (fallbackUrl ? await cache.match(fallbackUrl, { ignoreSearch:true }) : null);
  const update = fetch(event.request).then(response=>{
    if(response.ok){
      cache.put(event.request, response.clone());
    }
    return response;
  }).catch(()=>cached);

  if(cached){
    event.waitUntil(update);
    return cached;
  }

  return update;
}

async function networkFirst(request){
  const cache = await caches.open(cacheName);
  try{
    const response = await fetch(request);
    if(response.ok){
      cache.put(request, response.clone());
    }
    return response;
  }catch{
    return cache.match(request, { ignoreSearch:true });
  }
}

self.addEventListener("fetch", event=>{
  const url = new URL(event.request.url);

  if(event.request.method !== "GET" || url.origin !== self.location.origin){
    return;
  }

  if(url.pathname === "/cashier" || url.pathname === "/cashier.html"){
    event.respondWith(staleWhileRevalidate(event, "/cashier"));
    return;
  }

  if(url.pathname === "/app.js" || url.pathname === "/styles.css" || url.pathname === "/page-auth.js" || url.pathname === "/cashier-offline.js" || url.pathname === "/cashier-fast.js"){
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  if(url.pathname === "/api/menu"){
    event.respondWith(networkFirst(event.request));
    return;
  }

  if(url.pathname.startsWith("/api/menu-image/")){
    event.respondWith(
      caches.open(imageCacheName).then(async cache=>{
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
