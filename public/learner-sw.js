const shellCache = "bakhaw-learner-shell-shared-source-v24";
const imageCacheName = "roadworthy-cashier-images-current";
const offlineHost = "bis1.onrender.com";
const offlineEnabled = self.location.hostname.toLowerCase() === offlineHost;
const installShellUrls = [
  "/",
  "/customer",
  "/index.html",
  "/admin",
  "/admin.html",
  "/cashier",
  "/cashier.html",
  "/kitchen",
  "/kitchen.html",
  "/sales",
  "/sales.html",
  "/transactions",
  "/transactions.html",
  "/expenses",
  "/expenses.html",
  "/offline-reset",
  "/offline-reset.html",
  "/qr",
  "/qr.html",
  "/login",
  "/teacher-login",
  "/teacher-login.html",
  "/student-dashboard",
  "/student-dashboard.html",
  "/students",
  "/students.html",
  "/personnel",
  "/personnel.html",
  "/personnel-profile",
  "/personnel-profile.html",
  "/guidance",
  "/guidance.html",
  "/guidance-report",
  "/guidance-report.html",
  "/teacher-accounts",
  "/teacher-accounts.html",
  "/teacher-profile",
  "/teacher-profile.html",
  "/mineralex",
  "/mineralex/",
  "/mineralex/index.html",
  "/styles.css",
  "/styles.css?v=online-offline-v19",
  "/admin.js?v=online-offline-v19",
  "/app.js?v=online-offline-v19",
  "/app-shell-offline.js?v=online-offline-v19",
  "/cashier-fast.js?v=online-offline-v19",
  "/cashier-offline.js?v=online-offline-v19",
  "/expenses.js?v=online-offline-v19",
  "/guidance.css?v=online-offline-v19",
  "/guidance.js?v=api-only-guidance-v24",
  "/guidance-report.css?v=online-offline-v19",
  "/guidance-report.js?v=online-offline-v19",
  "/kitchen.js?v=online-offline-v19",
  "/teacher-login.css?v=online-offline-v19",
  "/teacher-login.js?v=online-offline-v19",
  "/learner-offline.js?v=online-offline-v19",
  "/mineralex/styles.css",
  "/mineralex/script.js",
  "/page-auth.js?v=online-offline-v19",
  "/personnel.css?v=online-offline-v19",
  "/personnel.js?v=online-offline-v19",
  "/personnel-profile.css?v=online-offline-v19",
  "/personnel-profile.js?v=online-offline-v19",
  "/qr.js?v=online-offline-v19",
  "/sales.js?v=online-offline-v19",
  "/student-dashboard.css?v=online-offline-v19",
  "/student-dashboard.js?v=online-offline-v19",
  "/students.css?v=online-offline-v19",
  "/students.js?v=online-offline-v19",
  "/teacher-accounts.css?v=online-offline-v19",
  "/teacher-accounts.js?v=online-offline-v19",
  "/teacher-session.css?v=online-offline-v19",
  "/teacher-session.js?v=online-offline-v19",
  "/transactions.js?v=online-offline-v19",
  "/learner-manifest.webmanifest",
  "/bakhaw-school-logo.png"
];

const offlineFallbacks = {
  "/":"/",
  "/customer":"/customer",
  "/index.html":"/",
  "/admin":"/admin",
  "/admin.html":"/admin",
  "/cashier":"/cashier",
  "/cashier.html":"/cashier",
  "/kitchen":"/kitchen",
  "/kitchen.html":"/kitchen",
  "/sales":"/sales",
  "/sales.html":"/sales",
  "/transaction":"/transactions",
  "/transactions":"/transactions",
  "/transactions.html":"/transactions",
  "/expenses":"/expenses",
  "/expenses.html":"/expenses",
  "/offline-reset":"/offline-reset",
  "/offline-reset.html":"/offline-reset",
  "/qr":"/qr",
  "/qr.html":"/qr",
  "/teacher-profile":"/teacher-profile",
  "/teacher-profile.html":"/teacher-profile",
  "/mineralex":"/mineralex",
  "/mineralex/":"/mineralex",
  "/mineralex/index.html":"/mineralex",
  "/login":"/login",
  "/teacher-login":"/teacher-login",
  "/teacher-login.html":"/login",
  "/students":"/students-offline-shell",
  "/students.html":"/students",
  "/personnel":"/personnel-offline-shell",
  "/personnel.html":"/personnel",
  "/personnel-profile":"/personnel-profile-offline-shell",
  "/personnel-profile.html":"/personnel-profile",
  "/student-dashboard":"/student-dashboard-offline-shell",
  "/student-dashboard.html":"/student-dashboard",
  "/guidance":"/guidance-offline-shell",
  "/guidance.html":"/guidance",
  "/guidance-report":"/guidance-report-offline-shell",
  "/guidance-report.html":"/guidance-report",
  "/teacher-accounts":"/teacher-accounts-offline-shell",
  "/teacher-accounts.html":"/teacher-accounts"
};
const appFallbackPaths = new Set(Object.keys(offlineFallbacks));
const protectedFallbackPaths = new Set([
  "/students", "/students.html", "/students-offline-shell",
  "/personnel", "/personnel.html", "/personnel-offline-shell",
  "/student-dashboard", "/student-dashboard.html", "/student-dashboard-offline-shell",
  "/guidance", "/guidance.html", "/guidance-offline-shell",
  "/guidance-report", "/guidance-report.html", "/guidance-report-offline-shell",
  "/teacher-accounts", "/teacher-accounts.html", "/teacher-accounts-offline-shell"
]);

function isStaticAsset(pathname){
  return /\.(?:css|js|png|jpg|jpeg|webp|svg|ico|json|webmanifest)$/i.test(pathname);
}

function isCacheableApi(pathname){
  if(pathname === "/api/guidance-cases"){
    return false;
  }

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
  ].includes(pathname);
}

function isSharedSourcePath(pathname){
  return [
    "/",
    "/customer",
    "/index.html",
    "/admin",
    "/admin.html",
    "/cashier",
    "/cashier.html",
    "/kitchen",
    "/kitchen.html",
    "/sales",
    "/sales.html",
    "/transactions",
    "/transactions.html",
    "/expenses",
    "/expenses.html",
    "/offline-reset",
    "/offline-reset.html",
    "/qr",
    "/qr.html",
    "/login",
    "/teacher-login",
    "/teacher-login.html",
    "/student-dashboard",
    "/student-dashboard.html",
    "/students",
    "/students.html",
    "/students-offline-shell",
    "/guidance",
    "/guidance.html",
    "/guidance-offline-shell",
    "/guidance-report",
    "/guidance-report.html",
    "/guidance-report-offline-shell",
    "/guidance.css",
    "/guidance.js",
    "/guidance-report.css",
    "/guidance-report.js",
    "/personnel",
    "/personnel.html",
    "/personnel-offline-shell",
    "/personnel-profile",
    "/personnel-profile.html",
    "/personnel-profile-offline-shell",
    "/personnel.js",
    "/personnel-profile.js",
    "/api/personnel-profiles",
    "/teacher-accounts",
    "/teacher-accounts.html",
    "/teacher-accounts-offline-shell",
    "/teacher-profile",
    "/teacher-profile.html",
    "/mineralex",
    "/mineralex/",
    "/mineralex/index.html",
    "/styles.css",
    "/admin.js",
    "/app.js",
    "/app-shell-offline.js",
    "/cashier-fast.js",
    "/cashier-offline.js",
    "/expenses.js",
    "/kitchen.js",
    "/teacher-login.css",
    "/teacher-login.js",
    "/learner-offline.js",
    "/mineralex/styles.css",
    "/mineralex/script.js",
    "/page-auth.js",
    "/personnel.css",
    "/personnel-profile.css",
    "/qr.js",
    "/sales.js",
    "/student-dashboard.css",
    "/student-dashboard.js",
    "/students.css",
    "/students.js",
    "/teacher-accounts.css",
    "/teacher-accounts.js",
    "/teacher-session.css",
    "/teacher-session.js",
    "/transactions.js",
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
    "/api/teacher-accounts"
  ].includes(pathname);
}

async function deleteOldShellCaches(){
  const keys = await caches.keys();
  await Promise.all(keys
    .filter(key=>key.startsWith("bakhaw-learner-shell-") && key !== shellCache)
    .map(key=>caches.delete(key)));
}

async function warmShellUrls(values){
  const cache = await caches.open(shellCache);
  const urls = (Array.isArray(values) ? values : [])
    .map(value=>{
      try{
        return new URL(value, self.location.origin);
      }catch{
        return null;
      }
    })
    .filter(url=>url && url.origin === self.location.origin);

  for(const url of urls){
    try{
      const response = await fetch(url.href, { cache:"no-store" });
      if(response.ok && !response.redirected){
        await cache.put(url.pathname, await cleanPersonnelProfileResponse(url.pathname, response));
      }
    }catch{
      // Pre-caching is best effort; anything already cached remains available.
    }
  }
}

function offlineFallbackResponse(request, pathname){
  if(pathname === "/login" || pathname === "/teacher-login" || pathname === "/teacher-login.html"){
    return offlineLoginResponse(request);
  }
  if(protectedFallbackPaths.has(pathname)){
    return offlineLoginResponse(request, pathname);
  }
  if(appFallbackPaths.has(pathname)){
    return offlineAppResponse();
  }
  return new Response("Open this page once on BIS1 with internet, then it can open offline.", {
    status:503,
    headers:{ "Content-Type":"text/plain; charset=utf-8" }
  });
}

function offlineAppResponse(){
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BIS1 Offline</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#edf7f1;color:#073f2b;font-family:Arial,sans-serif}
main{width:min(620px,calc(100% - 32px));padding:28px;border:1px solid #c5ddcf;border-radius:16px;background:#fff;box-shadow:0 18px 48px rgba(6,63,47,.1)}
h1{margin:0 0 10px;font-size:30px}p{font-size:18px;line-height:1.45;color:#51675c}
.links{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:18px}
a{display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 12px;border-radius:10px;background:#0c6842;color:#fff;text-decoration:none;font-weight:700}
</style>
</head>
<body>
<main>
<h1>BIS1 Offline</h1>
<p>The full page was not saved on this browser yet. Open BIS1 once with internet to refresh every page in the background.</p>
<div class="links">
<a href="/login">Login</a>
<a href="/student-dashboard">Dashboard</a>
<a href="/students">Learners</a>
<a href="/guidance">Guidance</a>
<a href="/offline-reset">Reset Offline</a>
</div>
</main>
</body>
</html>`;
  return new Response(html, {
    status:200,
    headers:{ "Content-Type":"text/html; charset=utf-8" }
  });
}

async function cacheFirstThenUpdate(event, fallbackPath = ""){
  const request = event.request;
  const cache = await caches.open(shellCache);
  const pathname = new URL(request.url).pathname;
  const cached = await cache.match(request)
    || await cache.match(pathname, { ignoreSearch:true })
    || (fallbackPath ? await cache.match(fallbackPath, { ignoreSearch:true }) : null);

  const update = (async ()=>{
    const response = await fetch(request, { cache:"no-store" });
    if(response.ok && !response.redirected){
      const cleanResponse = await cleanPersonnelProfileResponse(pathname, response);
      await cache.put(request, cleanResponse.clone());
      await cache.put(pathname, cleanResponse.clone());
      return cleanResponse;
    }
    return response;
  })();

  if(cached){
    event.waitUntil(update.catch(()=>{}));
    return cached;
  }

  try{
    return await update;
  }catch{
    return offlineFallbackResponse(request, pathname);
  }
}

async function networkFirstThenCache(event, fallbackPath = ""){
  const request = event.request;
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
    return await cache.match(request)
      || await cache.match(pathname, { ignoreSearch:true })
      || (fallbackPath ? await cache.match(fallbackPath, { ignoreSearch:true }) : null)
      || offlineFallbackResponse(request, pathname);
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

function offlineLoginResponse(request, fallbackNext = ""){
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || fallbackNext || "/student-dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/student-dashboard";
  const guidanceLogin = safeNext === "/guidance" || safeNext === "/guidance-report";
  const teacherOptions = guidanceLogin
    ? `<option value="alexander.moreno">ALEXANDER S. MORENO</option>`
    : `<option value="alexander.moreno">ALEXANDER S. MORENO</option>
      <option value="analyn.porras">ANALYN L. PORRAS</option>
      <option value="benita.lizada">BENITA T. LIZADA</option>
      <option value="charley.empestan">CHARLEY A. EMPESTAN</option>
      <option value="monalisa.lebuna">MONALISA G. LEBUNA</option>
      <option value="roxan.figueroa">ROXAN C. FIGUEROA</option>`;
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline Teacher Login</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#edf4e8;font-family:Arial,sans-serif;color:#063f2f}
main{width:min(560px,calc(100% - 32px));background:#fff;border:1px solid #c8ddcf;border-radius:18px;padding:28px;box-shadow:0 18px 50px rgba(0,0,0,.08)}
h1{margin:0 0 8px;font-size:34px}p{font-size:18px;line-height:1.45;color:#5d7067}label{display:block;margin:18px 0 8px;font-weight:700;font-size:18px}
select,input,button{width:100%;box-sizing:border-box;border-radius:12px;font-size:22px;min-height:64px}
select,input{border:1px solid #b9d1c2;padding:12px 16px;background:#fff}button{margin-top:20px;border:0;background:#087445;color:#fff;font-weight:800}
.notice{background:#fff7df;border:1px solid #e3c66d;border-radius:12px;padding:12px 14px}.error{color:#a6342d;font-weight:800;min-height:24px}
</style>
</head>
<body>
<main>
<h1>${guidanceLogin ? "Guidance Admin Login" : "Teacher Login"}</h1>
<p>This offline login is built into the app shell for times when the saved login page is missing.</p>
<form id="loginForm">
<label for="teacher">Teacher Name</label>
<select id="teacher">${teacherOptions}</select>
<label for="pin">4-Digit Password</label>
<input id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" autofocus>
<p class="notice">Data Privacy Notice: keep learner and personnel data confidential. Press Login only if you agree.</p>
<button type="submit">Login</button>
<p id="error" class="error" role="alert"></p>
</form>
</main>
<script>
(function(){
  const next = ${JSON.stringify(safeNext)};
  const guidance = ${JSON.stringify(guidanceLogin)};
  const form = document.getElementById("loginForm");
  const teacher = document.getElementById("teacher");
  const pin = document.getElementById("pin");
  const error = document.getElementById("error");
  form.addEventListener("submit", function(event){
    event.preventDefault();
    const username = teacher.value;
    const valid = guidance
      ? username === "alexander.moreno" && pin.value === "1111"
      : username === "alexander.moreno" ? pin.value === "1111" : pin.value === "1234";
    if(!valid){
      error.textContent = "Use the saved password or first-time PIN 1234 while offline.";
      pin.value = "";
      pin.focus();
      return;
    }
    sessionStorage.setItem("bakhawOfflineTeacher", "accepted");
    sessionStorage.setItem("bakhawDataPrivacyNoticeAgreed", "yes");
    if(guidance){
      sessionStorage.setItem("bakhawGuidanceAdmin", "accepted");
    }
    localStorage.setItem("bakhawCurrentTeacherSession", JSON.stringify({
      username:username,
      displayName:teacher.options[teacher.selectedIndex].textContent,
      savedAt:new Date().toISOString()
    }));
    window.location.replace(next);
  });
})();
</script>
</body>
</html>`;
  return new Response(html, {
    status:200,
    headers:{ "Content-Type":"text/html; charset=utf-8" }
  });
}

self.addEventListener("install", event=>{
  if(!offlineEnabled){
    event.waitUntil(self.skipWaiting());
    return;
  }
  event.waitUntil(
    warmShellUrls(installShellUrls)
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate", event=>{
  if(!offlineEnabled){
    event.waitUntil(self.registration.unregister());
    return;
  }
  event.waitUntil(
    deleteOldShellCaches()
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("message", event=>{
  if(!offlineEnabled){
    return;
  }
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

    event.waitUntil(warmShellUrls(urls));
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
  if(!offlineEnabled){
    return;
  }
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
    event.respondWith(
      isSharedSourcePath(url.pathname) || event.request.cache === "no-store"
        ? networkFirstThenCache(event, fallbackPath)
        : cacheFirstThenUpdate(event, fallbackPath)
    );
  }
});
