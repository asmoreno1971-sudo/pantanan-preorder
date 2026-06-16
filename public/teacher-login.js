const loginForm = document.getElementById("teacherLoginForm");
const usernameInput = document.getElementById("teacherUsername");
const pinInput = document.getElementById("teacherPin");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");
const privacyDialog = document.getElementById("privacyDialog");
const agreeButton = document.getElementById("agreeButton");
const disagreeButton = document.getElementById("disagreeButton");
const teacherDirectoryKey = "bakhawTeacherDirectory";
const currentTeacherKey = "bakhawCurrentTeacherSession";
const guidanceLogin = ["/guidance","/guidance-report"].includes(nextPage());
const guidanceAdmin = {
  username:"alexander.moreno",
  displayName:"Alexander Moreno"
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{...options,signal:controller.signal});
  }finally{
    window.clearTimeout(timeout);
  }
}

function savedTeacherDirectory(){
  try{
    const saved = JSON.parse(localStorage.getItem(teacherDirectoryKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  }catch{
    return [];
  }
}

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function saveCurrentTeacherSession(){
  const selected = usernameInput.selectedOptions?.[0];
  const displayName = selected?.textContent?.trim() || usernameInput.value.trim();
  if(!displayName){
    return;
  }
  localStorage.setItem(currentTeacherKey, JSON.stringify({
    username:usernameInput.value.trim().toLowerCase(),
    displayName,
    savedAt:new Date().toISOString()
  }));
}

function renderTeacherDirectory(teachers){
  if(guidanceLogin){
    teachers = [guidanceAdmin];
  }
  const current = usernameInput.value;
  usernameInput.innerHTML = `<option value="">Select your name</option>${teachers
    .map(teacher=>`<option value="${escapeHtml(teacher.username)}">${escapeHtml(teacher.displayName)}</option>`)
    .join("")}`;
  if([...usernameInput.options].some(option=>option.value === current)){
    usernameInput.value = current;
  }
}

async function loadTeacherDirectory(){
  if(guidanceLogin){
    renderTeacherDirectory([guidanceAdmin]);
    usernameInput.value = guidanceAdmin.username;
    usernameInput.disabled = true;
    usernameInput.closest("label").hidden = true;
    document.body.classList.add("guidance-login");
    document.querySelector(".login-brand h1").textContent = "Guidance Admin Login";
    document.querySelector(".login-intro").textContent = "Restricted access for Alexander Moreno.";
    document.querySelector(".default-pin-note").hidden = true;
    return;
  }

  const saved = savedTeacherDirectory();
  if(saved.length){
    renderTeacherDirectory(saved);
  }
  if(!navigator.onLine){
    if(!saved.length){
      loginError.textContent = "Connect to the internet once to load the teacher list.";
    }
    return;
  }

  try{
    const response = await fetchWithTimeout("/api/teacher-directory", { cache:"no-store" });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Teacher list could not be loaded.");
    }
    const teachers = Array.isArray(data.teachers) ? data.teachers : [];
    localStorage.setItem(teacherDirectoryKey, JSON.stringify(teachers));
    renderTeacherDirectory(teachers);
  }catch{
    if(!saved.length){
      loginError.textContent = "Connect to the internet once to load the teacher list.";
    }
  }
}

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
        const response = await fetchWithTimeout("/api/teacher-login", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({
            username:usernameInput.value.trim(),
            pin:pinInput.value,
            guidanceLogin
          })
        });
        const data = await response.json();

        if(!response.ok || !data.ok){
          throw new Error(data.message || "Login failed.");
        }
        await LearnerOffline.rememberCredentials(usernameInput.value, pinInput.value);
        saveCurrentTeacherSession();
        onlineLoginComplete = true;
      }catch(error){
        if(!(error instanceof TypeError) && error.name !== "AbortError"){
          throw error;
        }
      }
    }

    if(!onlineLoginComplete && !await LearnerOffline.verifyCredentials(usernameInput.value, pinInput.value)){
      throw new Error("Offline login is unavailable. Connect once and sign in successfully on this device first.");
    }
    saveCurrentTeacherSession();

    LearnerOffline.setOfflineSession(false);
    if(guidanceLogin){
      LearnerOffline.setOfflineSession(true);
      LearnerOffline.setGuidanceSession(true);
      loginButton.textContent = "Opening Guidance...";
      if(navigator.onLine){
        await LearnerOffline.registerServiceWorker();
      }
      window.location.replace(nextPage());
      return;
    }
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
      try{
        const response = await fetchWithTimeout("/api/teacher-consent", { method:"POST" });
        const data = await response.json();

        if(!response.ok || !data.ok){
          throw new Error(data.message || "Your agreement could not be recorded.");
        }
      }catch(error){
        if(!(error instanceof TypeError) && error.name !== "AbortError"){
          throw error;
        }
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

loadTeacherDirectory();
