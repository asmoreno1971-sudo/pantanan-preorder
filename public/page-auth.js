(function(){
  const openPaths = new Set(["/", "/index.html"]);
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";

  if(openPaths.has(currentPath)){
    return;
  }

  const password = "1111";
  const authKey = "pantananInternalPageAuth";
  const style = document.createElement("style");
  style.textContent = `
    html.auth-locked body > *:not(.page-auth-overlay){ display:none !important; }
    .page-auth-overlay{
      min-height:100vh;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
      background:#f7f1ea;
      color:#2f2118;
      font-family:Arial, sans-serif;
    }
    .page-auth-card{
      width:min(360px, 100%);
      padding:24px;
      border:1px solid #d9c8b8;
      border-radius:10px;
      background:#fffaf4;
      box-shadow:0 16px 36px rgba(74,47,28,.1);
    }
    .page-auth-card h3{
      margin:0 0 16px;
      font-size:22px;
    }
    .page-auth-card input,
    .page-auth-card button{
      width:100%;
      min-height:48px;
      border-radius:8px;
      font-size:18px;
    }
    .page-auth-card input{
      padding:10px 12px;
      border:1px solid #d2bdaa;
      background:#fff;
    }
    .page-auth-card button{
      margin-top:12px;
      border:0;
      background:#1f8f4d;
      color:#fff;
      font-weight:700;
    }
    .page-auth-error{
      min-height:20px;
      margin-top:10px;
      color:#9a3f32;
      font-weight:700;
    }
  `;
  document.head.appendChild(style);

  if(sessionStorage.getItem(authKey) === "ok"){
    return;
  }

  document.documentElement.classList.add("auth-locked");

  document.addEventListener("DOMContentLoaded", function(){
    const overlay = document.createElement("div");
    overlay.className = "page-auth-overlay";
    overlay.innerHTML = `
      <form class="page-auth-card">
        <h3>Enter Password</h3>
        <input id="pageAuthPassword" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Password" autofocus>
        <button type="submit">Open</button>
        <div id="pageAuthError" class="page-auth-error"></div>
      </form>
    `;

    document.body.appendChild(overlay);

    const form = overlay.querySelector("form");
    const input = overlay.querySelector("#pageAuthPassword");
    const error = overlay.querySelector("#pageAuthError");

    form.addEventListener("submit", function(event){
      event.preventDefault();

      if(input.value === password){
        sessionStorage.setItem(authKey, "ok");
        document.documentElement.classList.remove("auth-locked");
        overlay.remove();
        return;
      }

      error.innerText = "Wrong password";
      input.value = "";
      input.focus();
    });
  });
})();
