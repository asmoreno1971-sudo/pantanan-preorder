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
const privacyAgreementKey = "bakhawDataPrivacyNoticeAgreed";
const guidanceLogin = ["/guidance","/guidance-report"].includes(nextPage());
const guidanceAdmin = {
  username:"alexander.moreno",
  displayName:"Alexander Moreno"
};
const fallbackTeacherNames = [
  "ALEXANDER S. MORENO", "ANALYN L. PORRAS", "BENITA T. LIZADA", "CHARLEY A. EMPESTAN",
  "CRISTY R. DENIEGA", "DARLYN JOY C. HERRERA", "EDEN P. BARCEBAS", "GELINE JR. L. ARELLANO",
  "GINA M. MUYUELA", "GIRLY G. ALBUYA", "GRACE C. NISMAL", "JANICE G. REMANDABAN",
  "JOAN S. QUITOS", "JONA T. TABALDO", "JOSE JOSEPH RICAPLAZA DE LA FUENTE", "JOSIE V. DEVIZA",
  "NOE V. BALAJIDIONG JR.", "JULIE ANN T. VASQUEZ", "JYLEN P. ADUANA", "LORENCE A. TAGACAY",
  "LORRAINE GRACE S. PETROLA", "LOVELLA S. FUENTES", "MA. DIVINA G. ANDRES", "MARIA KARMILA S. FAYO",
  "MARVY P. BONDAD", "MONALISA G. LEBUNA", "ROSELYN D. SANTILLAN", "ROXAN C. FIGUEROA",
  "SANDRA M. DIONIO", "SHANE DAVE C. ALMELDA", "SHANE F. NATONTON", "ZARAH C. CAPINIG",
  "ANGEL HELLARES ZAFRA", "RISHELLE G. HURTADA", "CJ D. CORTEZ", "MARIDEL N. ONATO"
];
const fallbackTeacherDirectory = fallbackTeacherNames.map(displayName=>({
  displayName,
  username:teacherUsernameFromName(displayName)
})).filter(teacher=>teacher.username.includes("."));
const defaultTeacherPin = "1234";
let serverSessionReady = false;

function openPrivacyNotice(){
  agreeButton.disabled = false;
  disagreeButton.disabled = false;
  agreeButton.textContent = "Agree";
  disagreeButton.textContent = "Disagree";
  loginButton.textContent = "Opening...";
  privacyDialog.showModal();
}

function backgroundServerLogin(){
  if(!navigator.onLine){
    return;
  }
  fetchWithTimeout("/api/teacher-login", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      username:currentTeacherUsername(),
      pin:pinInput.value,
      guidanceLogin
    })
  }, 8000)
    .then(response=>{
      serverSessionReady = response.ok;
    })
    .catch(()=>{
      serverSessionReady = false;
    });
}

function openNextPage(){
  LearnerOffline.setOfflineSession(true);
  if(guidanceLogin){
    LearnerOffline.setGuidanceSession(true);
  }
  sessionStorage.setItem(privacyAgreementKey, "yes");
  LearnerOffline.registerServiceWorker().catch(()=>{});
  window.location.replace(nextPage());
}

function openPrivacyOrContinue(){
  if(sessionStorage.getItem(privacyAgreementKey) === "yes"){
    openNextPage();
    return;
  }
  openPrivacyNotice();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{...options,signal:controller.signal});
  }finally{
    window.clearTimeout(timeout);
  }
}

async function readJsonResponse(response, fallbackMessage){
  const text = await response.text();
  if(!text.trim()){
    throw new Error(fallbackMessage || "The server returned an empty response.");
  }
  try{
    return JSON.parse(text);
  }catch{
    throw new Error(fallbackMessage || "The server response could not be read.");
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

function currentTeacherDisplayName(){
  const selected = usernameInput.selectedOptions?.[0];
  const displayName = selected?.textContent?.trim() || "";
  return displayName && displayName !== "Select your name" ? displayName : "";
}

function currentTeacherUsername(){
  const username = usernameInput.value.trim().toLowerCase();
  if(username){
    return username;
  }
  return teacherUsernameFromName(currentTeacherDisplayName());
}

function saveCurrentTeacherSession(){
  const displayName = currentTeacherDisplayName() || currentTeacherUsername();
  if(!displayName){
    return;
  }
  localStorage.setItem(currentTeacherKey, JSON.stringify({
    username:currentTeacherUsername(),
    displayName,
    savedAt:new Date().toISOString()
  }));
}

function teacherUsernameFromName(name){
  const words = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .split(/\s+/)
    .map(word=>word.replace(/\./g, ""))
    .filter(Boolean);
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  while(words.length && suffixes.has(words[words.length - 1])){
    words.pop();
  }
  return `${words[0] || ""}.${words[words.length - 1] || ""}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

function selectedTeacherExists(){
  const username = currentTeacherUsername();
  if(currentTeacherDisplayName() && username){
    return true;
  }
  return fallbackTeacherDirectory.some(teacher=>teacher.username === username)
    || savedTeacherDirectory().some(teacher=>String(teacher.username || "").trim().toLowerCase() === username)
    || username === guidanceAdmin.username;
}

async function canUseOfflineLogin(){
  const username = currentTeacherUsername();
  if(username === guidanceAdmin.username && pinInput.value === "1111"){
    return true;
  }
  if(!guidanceLogin && username !== guidanceAdmin.username && pinInput.value === defaultTeacherPin && selectedTeacherExists()){
    return true;
  }
  try{
    if(await LearnerOffline.verifyCredentials(username, pinInput.value)){
      return true;
    }
  }catch{
    // Browser storage can be unavailable or blocked; the default PIN path can still work.
  }
  return false;
}

function isNetworkLoginError(error){
  return error instanceof TypeError
    || error?.name === "AbortError"
    || /failed to fetch|networkerror|load failed/i.test(String(error?.message || ""));
}

function offlineLoginMessage(){
  return guidanceLogin
    ? "Use the administrator password 1111 while offline."
    : "Use the saved password or first-time PIN 1234 while offline.";
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
    document.querySelector(".login-intro").textContent = "This app is subject to Data Privacy Act of 2012. Full data confidentiality is strongly enforced.";
    document.querySelector(".default-pin-note").hidden = true;
    return;
  }

  const saved = savedTeacherDirectory();
  renderTeacherDirectory(saved.length ? saved : fallbackTeacherDirectory);
  if(!navigator.onLine){
    return;
  }

  try{
    const response = await fetchWithTimeout("/api/teacher-directory", { cache:"no-store" });
    const data = await readJsonResponse(response, "Teacher list could not be loaded.");
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Teacher list could not be loaded.");
    }
    const teachers = Array.isArray(data.teachers) ? data.teachers : [];
    localStorage.setItem(teacherDirectoryKey, JSON.stringify(teachers));
    renderTeacherDirectory(teachers);
  }catch{
    if(saved.length){
      renderTeacherDirectory(saved);
    }
  }
}

function nextPage(){
  const next = new URLSearchParams(window.location.search).get("next") || "/student-dashboard";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/student-dashboard";
}

function isTemporaryStorageError(error){
  return /database connection is temporarily unavailable|database unavailable|storage.*temporarily/i.test(String(error?.message || ""));
}

pinInput.addEventListener("input", ()=>{
  pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
});

loginForm.addEventListener("submit", async event=>{
  event.preventDefault();
  loginError.textContent = "";
  serverSessionReady = false;

  if(!/^\d{4}$/.test(pinInput.value)){
    loginError.textContent = "Password must contain exactly 4 digits.";
    pinInput.focus();
    return;
  }

  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";

  try{
    const localLoginAllowed = await canUseOfflineLogin();
    if(localLoginAllowed){
      saveCurrentTeacherSession();
      LearnerOffline.rememberCredentials(currentTeacherUsername(), pinInput.value).catch(()=>{});
      backgroundServerLogin();
      openPrivacyOrContinue();
      return;
    }

    let onlineLoginComplete = false;
    let onlineLoginError = null;
    if(navigator.onLine){
      try{
        const response = await fetchWithTimeout("/api/teacher-login", {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body:JSON.stringify({
            username:currentTeacherUsername(),
            pin:pinInput.value,
            guidanceLogin
          })
        });
        const data = await readJsonResponse(response, "Login is available offline with the saved password or first-time PIN.");

        if(!response.ok || !data.ok){
          const error = new Error(data.message || "Login failed.");
          error.status = response.status;
          throw error;
        }
        await LearnerOffline.rememberCredentials(currentTeacherUsername(), pinInput.value);
        saveCurrentTeacherSession();
        onlineLoginComplete = true;
        serverSessionReady = true;
      }catch(error){
        onlineLoginError = error;
      }
    }

    if(!onlineLoginComplete && !await canUseOfflineLogin()){
      if(onlineLoginError){
        if(isNetworkLoginError(onlineLoginError)){
          throw new Error(offlineLoginMessage());
        }
        if(onlineLoginError.status && onlineLoginError.status < 500){
          throw onlineLoginError;
        }
        throw new Error(offlineLoginMessage());
      }
      throw new Error("Offline login is unavailable. Connect once and sign in successfully on this device first.");
    }

    if(!onlineLoginComplete){
      serverSessionReady = false;
      try{
        await LearnerOffline.rememberCredentials(currentTeacherUsername(), pinInput.value);
      }catch{
        // IndexedDB can be unavailable in private browsing; the current session can still continue.
      }
    }
    saveCurrentTeacherSession();

    if(guidanceLogin){
      openPrivacyOrContinue();
      return;
    }
    openPrivacyOrContinue();
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
    if(navigator.onLine && serverSessionReady){
      fetchWithTimeout("/api/teacher-consent", { method:"POST" }).catch(()=>{});
    }
    openNextPage();
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
    sessionStorage.removeItem(privacyAgreementKey);
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

LearnerOffline.registerServiceWorker().catch(()=>{});
loadTeacherDirectory();
