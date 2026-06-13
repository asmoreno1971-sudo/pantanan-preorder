(function(){
  async function logout(){
    try{
      if(window.LearnerOffline){
        LearnerOffline.clearOfflineSession();
      }
      if(navigator.onLine){
        await fetch("/api/teacher-logout", { method:"POST" });
      }
    }finally{
      window.location.replace("/teacher-login");
    }
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    document.querySelectorAll("[data-teacher-logout]").forEach(button=>{
      button.addEventListener("click", logout);
    });

    fetch("/api/teacher-session", { cache:"no-store" })
      .then(response=>response.ok ? response.json() : null)
      .then(session=>{
        if(session?.role === "admin"){
          document.querySelectorAll("[data-admin-only]").forEach(element=>{
            element.hidden = false;
          });
        }
      })
      .catch(()=>{});
  });
})();
