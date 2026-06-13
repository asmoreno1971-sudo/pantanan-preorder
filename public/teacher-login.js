const loginForm = document.getElementById("teacherLoginForm");
const usernameInput = document.getElementById("teacherUsername");
const pinInput = document.getElementById("teacherPin");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");
const privacyDialog = document.getElementById("privacyDialog");
const agreeButton = document.getElementById("agreeButton");
const disagreeButton = document.getElementById("disagreeButton");

function nextPage(){
  const next = new URLSearchParams(window.location.search).get("next") || "/student-dashboard";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/student-dashboard";
}

pinInput.addEventListener("input", ()=>{
  pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
});

loginForm.addEventListener("submit", async event=>{
  event.preventDefault();
  loginError.textContent = "";

  if(!/^\d{4}$/.test(pinInput.value)){
    loginError.textContent = "Password must contain exactly 4 digits.";
    pinInput.focus();
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";

  try{
    let onlineLoginComplete = false;
    if(navigator.onLine){
      try{
        const response = await fetch("/api/teacher-login", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({
            username:usernameInput.value.trim(),
            pin:pinInput.value
          })
        });
        const data = await response.json();

        if(!response.ok || !data.ok){
          throw new Error(data.message || "Login failed.");
        }
        await LearnerOffline.rememberCredentials(usernameInput.value, pinInput.value);
        onlineLoginComplete = true;
      }catch(error){
        if(!(error instanceof TypeError)){
          throw error;
        }
      }
    }

    if(!onlineLoginComplete && !await LearnerOffline.verifyCredentials(usernameInput.value, pinInput.value)){
      throw new Error("Offline login is unavailable. Connect once and sign in successfully on this device first.");
    }

    LearnerOffline.setOfflineSession(false);
    privacyDialog.showModal();
    agreeButton.focus();
  }catch(error){
    loginError.textContent = error.message;
    pinInput.value = "";
    pinInput.focus();
  }finally{
    loginButton.disabled = false;
    loginButton.textContent = "Login";
  }
});

privacyDialog.addEventListener("cancel", event=>{
  event.preventDefault();
});

agreeButton.addEventListener("click", async ()=>{
  agreeButton.disabled = true;
  disagreeButton.disabled = true;
  agreeButton.textContent = "Continuing...";

  try{
    if(navigator.onLine){
      const response = await fetch("/api/teacher-consent", { method:"POST" });
      const data = await response.json();

      if(!response.ok || !data.ok){
        throw new Error(data.message || "Your agreement could not be recorded.");
      }
    }

    LearnerOffline.setOfflineSession(true);
    if(navigator.onLine){
      await LearnerOffline.registerServiceWorker();
    }
    window.location.replace(nextPage());
  }catch(error){
    privacyDialog.close();
    loginError.textContent = error.message;
    pinInput.value = "";
    pinInput.focus();
    agreeButton.disabled = false;
    disagreeButton.disabled = false;
    agreeButton.textContent = "Agree";
  }
});

disagreeButton.addEventListener("click", async ()=>{
  agreeButton.disabled = true;
  disagreeButton.disabled = true;
  disagreeButton.textContent = "Signing out...";

  try{
    LearnerOffline.clearOfflineSession();
    if(navigator.onLine){
      await fetch("/api/teacher-logout", { method:"POST" });
    }
  }finally{
    privacyDialog.close();
    loginForm.reset();
    loginError.textContent = "You must agree to the Data Privacy Notice to access learner records.";
    usernameInput.focus();
    agreeButton.disabled = false;
    disagreeButton.disabled = false;
    disagreeButton.textContent = "Disagree";
  }
});
