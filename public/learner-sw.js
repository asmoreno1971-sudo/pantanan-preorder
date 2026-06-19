const shellCache = "bakhaw-learner-shell-show-saved-cases-13";
const imageCacheName = "roadworthy-cashier-images-current";

const offlineFallbacks = {
  "/":"/",
  "/customer":"/customer",
  "/index.html":"/index.html",
  "/admin":"/admin",
  "/admin.html":"/admin.html",
  "/cashier":"/cashier",
  "/cashier.html":"/cashier.html",
  "/kitchen":"/kitchen",
  "/kitchen.html":"/kitchen.html",
  "/sales":"/sales",
  "/sales.html":"/sales.html",
  "/transaction":"/transactions",
  "/transactions":"/transactions",
  "/transactions.html":"/transactions.html",
  "/expenses":"/expenses",
  "/expenses.html":"/expenses.html",
  "/qr":"/qr",
  "/qr.html":"/qr.html",
  "/teacher-profile":"/teacher-profile",
  "/teacher-profile.html":"/teacher-profile.html",
  "/mineralex":"/mineralex",
  "/mineralex/":"/mineralex",
  "/mineralex/index.html":"/mineralex/index.html",
  "/login":"/login",
  "/teacher-login":"/teacher-login",
  "/teacher-login.html":"/teacher-login.html",
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

function isStaticAsset(pathname){
  return /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|json|webmanifest)$/i.test(pathname);
}

function isCacheableApi(pathname){
  if(pathname.startsWith("/api/orders/") || pathname.startsWith("/api/expenses/")){
    return true;
  }

  return [
    "/api/config",
    "/api/menu",
    "/api/customers.csv",
    "/api/kiosk-settings",
    "/api/kiosk-status",
    "/api/storage-status",
    "/api/orders",
    "/api/sales/daily",
    "/api/sales/profit",
    "/api/transactions",
    "/api/expenses",
    "/api/students",
    "/api/students.csv",
    "/api/teacher-directory",
    "/api/grade-sections",
    "/api/advisory-directory",
    "/api/personnel",
    "/api/teacher-session",
    "/api/teacher-accounts",
    "/api/personnel-profiles",
    "/api/guidance-cases"
  ].includes(pathname);
}

async function deleteOldShellCaches(){
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(key=>key.startsWith("bakhaw-learner-shell-") && key !== shellCache)
    .map(key=>caches.delete(key)));
}

async function networkFirst(request, fallbackPath = ""){
  const cache = await caches.open(shellCache);
  const pathname = new URL(request.url).pathname;
  try{
    const response = await fetch(request, { cache:"no-store" });
    if(response.ok && !response.redirected){
      const cleanResponse = await cleanPersonnelProfileResponse(pathname, response);
      await cache.put(request, cleanResponse.clone());
      await cache.put(pathname, cleanResponse.clone());
      return cleanResponse;
    }
    return response;
  }catch{
    const cached = await cache.match(request)
      || await cache.match(pathname, { ignoreSearch:true })
      || (fallbackPath ? await cache.match(fallbackPath, { ignoreSearch:true }) : null);
    if(cached){
      return cached;
    }
    return new Response("Open and sign in to this app once with internet before using this page offline.", {
      status:503,
      headers:{ "Content-Type":"text/plain; charset=utf-8" }
    });
  }
}

async function cleanPersonnelProfileResponse(pathname, response){
  if(pathname !== "/personnel-profile" && pathname !== "/personnel-profile.html" && pathname !== "/personnel-profile-offline-shell"){
    return response;
  }
  const type = response.headers.get("Content-Type") || "";
  if(!type.includes("text/html")){
    return response;
  }
  const html = await response.clone().text();
  const cleanHtml = html.replace(/\s*<button[^>]*id=["']clearProfileButton["'][\s\S]*?<\/button>/gi, "");
  return new Response(cleanHtml, {
    status:response.status,
    statusText:response.statusText,
    headers:response.headers
  });
}

self.addEventListener("install", event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event=>{
  event.waitUntil(
    deleteOldShellCaches()
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message", event=>{
  if(event.data && event.data.type === "CACHE_SHELL_URLS"){
    const urls = (Array.isArray(event.data.urls) ? event.data.urls : [])
      .map(value=>{
        try{
          return new URL(value, self.location.origin);
        }catch{
          return null;
        }
      })
      .filter(url=>url && url.origin === self.location.origin);

    event.waitUntil((async ()=>{
      const cache = await caches.open(shellCache);
      for(const url of urls){
        try{
          const response = await fetch(url.href, { cache:"no-store" });
          if(response.ok && !response.redirected){
            await cache.put(url.pathname, await cleanPersonnelProfileResponse(url.pathname, response));
          }
        }catch{
          // Warming is best effort; normal navigation caching still applies.
        }
      }
    })());
    return;
  }

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
      try{
        const response = await fetch(url, { cache:"no-store" });
        if(response.ok){
          await cache.put(url, response);
        }
      }catch{
        // Product images are optional offline polish; keep the shell available.
      }
    }
  })());
});

self.addEventListener("fetch", event=>{
  if(event.request.method !== "GET"){
    return;
  }

  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin){
    return;
  }

  const fallbackPath = offlineFallbacks[url.pathname];
  if(url.pathname.startsWith("/api/menu-image/")){
    event.respondWith((async ()=>{
      const cache = await caches.open(imageCacheName);
      try{
        const response = await fetch(event.request, { cache:"no-store" });
        if(response.ok){
          await cache.put(event.request, response.clone());
        }
        return response;
      }catch{
        return await cache.match(event.request) || new Response("", { status:404 });
      }
    })());
    return;
  }

  if(fallbackPath || isStaticAsset(url.pathname) || isCacheableApi(url.pathname)){
    event.respondWith(networkFirst(event.request, fallbackPath));
  }
});
