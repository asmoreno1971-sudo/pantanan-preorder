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
  });
})();
