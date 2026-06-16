const profileForm = document.getElementById("personnelProfileForm");
const personnelName = document.getElementById("personnelName");
const profileSyncStatus = document.getElementById("profileSyncStatus");
const profileFormMessage = document.getElementById("profileFormMessage");
const saveProfileButton = document.getElementById("saveProfileButton");
const clearProfileButton = document.getElementById("clearProfileButton");

const teacherDirectoryKey = "bakhawTeacherDirectory";
const personnelStorageKey = "bakhawPersonnelProfiles";
const personnelProfilesKey = "bakhawPersonnelProfileRecords";
const pendingProfilesKey = "bakhawPersonnelProfilePending";
const currentTeacherKey = "bakhawCurrentTeacherSession";

let teacherDirectory = [];
let officialPersonnel = [];
let profiles = [];
let currentTeacherName = "";
let syncInFlight = false;

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function storageList(key){
  try{
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved : [];
  }catch{
    return [];
  }
}

function saveStorageList(key, value){
  localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

function normalizeName(value){
  return String(value || "").trim().replace(/\s+/g," ");
}

function teacherDisplayName(teacher){
  return normalizeName(teacher?.displayName || teacher?.name || teacher?.username || "");
}

function profileKey(name){
  return normalizeName(name).toLowerCase();
}

function nameTokens(name){
  return profileKey(name)
    .replace(/[^a-z0-9\s]/g," ")
    .split(/\s+/)
    .filter(Boolean);
}

function meaningfulNameTokens(name){
  return nameTokens(name).filter(token=>token.length > 1 && !["jr","sr","ii","iii","iv"].includes(token));
}

function samePersonName(a,b){
  const left = nameTokens(a);
  const right = nameTokens(b);
  if(!left.length || !right.length){
    return false;
  }
  if(left.join(" ") === right.join(" ")){
    return true;
  }
  const leftMeaningful = meaningfulNameTokens(a);
  const rightMeaningful = meaningfulNameTokens(b);
  const smaller = leftMeaningful.length <= rightMeaningful.length ? leftMeaningful : rightMeaningful;
  const larger = leftMeaningful.length > rightMeaningful.length ? leftMeaningful : rightMeaningful;
  return smaller.length >= 2 && smaller.every(token=>larger.includes(token));
}

function officialPersonnelName(item){
  return normalizeName(item?.name || item || "");
}

function officialPersonnelNames(){
  return officialPersonnel.map(officialPersonnelName).filter(Boolean);
}

function matchingOfficialName(name){
  const key = profileKey(name);
  if(!key){
    return "";
  }
  return officialPersonnelNames().find(officialName=>profileKey(officialName) === key)
    || officialPersonnelNames().find(officialName=>samePersonName(name, officialName))
    || "";
}

function profileFetch(url, options = {}, timeoutMs = 3000){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(), timeoutMs);
  return fetch(url,{...options,signal:controller.signal}).finally(()=>window.clearTimeout(timeout));
}

function uniqueTeacherNames(){
  const names = teacherDirectory.map(teacherDisplayName).filter(Boolean);
  return [...new Map(names.map(name=>[profileKey(name), name])).values()]
    .sort((a,b)=>a.localeCompare(b));
}

function savedCurrentTeacher(){
  try{
    return JSON.parse(localStorage.getItem(currentTeacherKey) || "null") || null;
  }catch{
    return null;
  }
}

function saveCurrentTeacher(teacher){
  if(!teacher?.displayName && !teacher?.username){
    return;
  }
  localStorage.setItem(currentTeacherKey, JSON.stringify({
    username:String(teacher.username || "").trim().toLowerCase(),
    displayName:normalizeName(teacher.displayName || teacher.name || teacher.username || ""),
    savedAt:new Date().toISOString()
  }));
}

function setCurrentTeacherName(name){
  const cleanName = matchingOfficialName(name) || normalizeName(name);
  if(!cleanName){
    return;
  }
  currentTeacherName = cleanName;
  personnelName.value = cleanName;
  setFormProfile(currentProfileForName(cleanName));
}

function blankProfile(name = ""){
  return {
    name,
    sex:"",
    birthday:"",
    position:"",
    department:"",
    advisory:"",
    contactNumber:"",
    depedEmail:"",
    address:"",
    emergencyContact:"",
    employeeNumber:"",
    gsis:"",
    philHealth:"",
    tin:"",
    pagibig:"",
    prcLicense:"",
    notes:""
  };
}

function currentProfileForName(name){
  const officialName = matchingOfficialName(name) || name;
  const key = profileKey(officialName);
  return profiles.find(profile=>profileKey(profile.name) === key) || blankProfile(officialName);
}

function setFormProfile(profile){
  [...profileForm.elements].forEach(field=>{
    if(!field.name){
      return;
    }
    field.value = profile[field.name] || "";
  });
}

function profileFromForm(){
  const formData = new FormData(profileForm);
  const profile = blankProfile(normalizeName(formData.get("name")));
  Object.keys(profile).forEach(key=>{
    if(key !== "name"){
      profile[key] = String(formData.get(key) || "").trim();
    }
  });
  profile.depedEmail = profile.depedEmail.toLowerCase();
  profile.updatedAt = new Date().toISOString();
  return profile;
}

function upsertLocalProfile(profile){
  const officialName = matchingOfficialName(profile.name) || profile.name;
  profile.name = officialName;
  const key = profileKey(officialName);
  const index = profiles.findIndex(item=>profileKey(item.name) === key);
  if(index >= 0){
    profiles[index] = { ...profiles[index], ...profile };
  }else{
    profiles.unshift(profile);
  }
  saveStorageList(personnelProfilesKey, profiles);
}

function alignProfilesToOfficialPersonnel(){
  if(!officialPersonnel.length){
    return;
  }
  const profilesByName = new Map(profiles.map(profile=>[profileKey(profile.name), profile]));
  profiles = officialPersonnelNames().map(name=>profilesByName.get(profileKey(name)) || blankProfile(name));
  saveStorageList(personnelProfilesKey, profiles);
}

function queueProfile(profile){
  const pending = storageList(pendingProfilesKey);
  const key = profileKey(profile.name);
  const index = pending.findIndex(item=>profileKey(item.name) === key);
  if(index >= 0){
    pending[index] = profile;
  }else{
    pending.push(profile);
  }
  saveStorageList(pendingProfilesKey, pending);
}

function pendingCount(){
  return storageList(pendingProfilesKey).length;
}

function updateSyncStatus(message){
  const pending = pendingCount();
  const suffix = pending ? ` ${pending} profile${pending === 1 ? "" : "s"} waiting to sync.` : "";
  profileSyncStatus.textContent = `${message}${suffix}`;
}

async function loadTeacherDirectory(){
  teacherDirectory = storageList(teacherDirectoryKey);
  if(!navigator.onLine){
    if(!teacherDirectory.length){
      updateSyncStatus("Connect once to load the teacher list.");
    }
    return;
  }
  try{
    const response = await profileFetch("/api/teacher-directory", { cache:"no-store" });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Teacher list could not be loaded.");
    }
    teacherDirectory = Array.isArray(data.teachers) ? data.teachers : [];
    saveStorageList(teacherDirectoryKey, teacherDirectory);
  }catch{
    if(!teacherDirectory.length){
      updateSyncStatus("Teacher list could not be loaded. Try again with internet.");
    }
  }
}

async function loadPersonnelSource(){
  officialPersonnel = storageList(personnelStorageKey);
  alignProfilesToOfficialPersonnel();
  if(!navigator.onLine){
    return;
  }
  try{
    const response = await profileFetch("/api/personnel", { cache:"no-store" });
    const data = await response.json();
    if(response.ok && data.ok){
      officialPersonnel = Array.isArray(data.personnel) ? data.personnel : [];
      saveStorageList(personnelStorageKey, officialPersonnel);
      alignProfilesToOfficialPersonnel();
    }
  }catch{
    // Saved Personnel Consol list remains the offline fallback.
  }
}

async function loadCurrentTeacher(){
  const saved = savedCurrentTeacher();
  if(saved?.displayName){
    setCurrentTeacherName(saved.displayName);
  }
  if(!navigator.onLine){
    return;
  }
  try{
    const response = await profileFetch("/api/teacher-session", { cache:"no-store" });
    const session = await response.json();
    if(response.ok && session?.ok && session.displayName){
      saveCurrentTeacher(session);
      setCurrentTeacherName(session.displayName);
      return;
    }
  }catch{
    // Saved session name remains the offline fallback.
  }
}

async function loadProfiles(){
  profiles = storageList(personnelProfilesKey);
  alignProfilesToOfficialPersonnel();
  updateSyncStatus(profiles.length ? "Saved personnel profiles shown." : "No saved personnel profiles yet.");
  if(!navigator.onLine){
    updateSyncStatus(profiles.length ? "Offline mode: saved profiles shown." : "No offline personnel profiles are saved yet.");
    return;
  }
  try{
    await syncPendingProfiles();
    const response = await profileFetch("/api/personnel-profiles", { cache:"no-store" });
    const data = await response.json();
    if(response.status === 401){
      window.location.replace(`/teacher-login?next=${encodeURIComponent("/personnel-profile")}`);
      return;
    }
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Personnel profiles could not be loaded.");
    }
    if(Array.isArray(data.personnel)){
      officialPersonnel = data.personnel;
      saveStorageList(personnelStorageKey, officialPersonnel);
    }
    profiles = Array.isArray(data.profiles) ? data.profiles : [];
    alignProfilesToOfficialPersonnel();
    saveStorageList(personnelProfilesKey, profiles);
    updateSyncStatus(`${profiles.length.toLocaleString()} personnel profile${profiles.length === 1 ? "" : "s"} loaded.`);
    if(currentTeacherName || personnelName.value){
      setCurrentTeacherName(currentTeacherName || personnelName.value);
    }
  }catch(error){
    updateSyncStatus(profiles.length ? "Saved profiles shown. Reconnect to refresh." : (error.message || "Personnel profiles could not be loaded."));
  }
}

async function syncPendingProfiles(){
  if(syncInFlight || !navigator.onLine){
    return;
  }
  const pending = storageList(pendingProfilesKey);
  if(!pending.length){
    return;
  }
  syncInFlight = true;
  try{
    const remaining = [];
    for(const profile of pending){
      try{
        const response = await profileFetch("/api/personnel-profiles", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ profile })
        });
        const data = await response.json();
        if(!response.ok || !data.ok){
          throw new Error(data.message || "Profile could not be synchronized.");
        }
        upsertLocalProfile(data.profile || profile);
      }catch{
        remaining.push(profile);
      }
    }
    saveStorageList(pendingProfilesKey, remaining);
  }finally{
    syncInFlight = false;
  }
}

profileForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const profile = profileFromForm();
  const officialName = matchingOfficialName(profile.name);
  if(officialName){
    profile.name = officialName;
  }
  if(!profile.name){
    profileFormMessage.textContent = "Select a personnel name first.";
    return;
  }
  if(officialPersonnel.length && !matchingOfficialName(profile.name)){
    profileFormMessage.textContent = "Your name is not listed in Personnel Consol Column A.";
    return;
  }
  saveProfileButton.disabled = true;
  saveProfileButton.textContent = "Saving...";
  upsertLocalProfile(profile);
  try{
    if(!navigator.onLine){
      throw new Error("offline");
    }
    const response = await profileFetch("/api/personnel-profiles", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ profile })
    });
    const data = await response.json();
    if(response.status === 401){
      window.location.replace(`/teacher-login?next=${encodeURIComponent("/personnel-profile")}`);
      return;
    }
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Profile could not be saved.");
    }
    upsertLocalProfile(data.profile || profile);
    profileFormMessage.textContent = `${profile.name} profile saved.`;
  }catch(error){
    queueProfile(profile);
    profileFormMessage.textContent = `${profile.name} profile saved offline and will sync automatically.`;
  }finally{
    saveProfileButton.disabled = false;
    saveProfileButton.textContent = "Save Profile";
    updateSyncStatus("Saved personnel profiles shown.");
  }
});

clearProfileButton.addEventListener("click",()=>{
  const name = currentTeacherName || personnelName.value;
  profileForm.reset();
  setCurrentTeacherName(name);
  setFormProfile(blankProfile(name));
  profileFormMessage.textContent = "Form cleared.";
});

window.addEventListener("online",async ()=>{
  updateSyncStatus("Connection restored. Syncing personnel profiles...");
  await syncPendingProfiles();
  await loadProfiles();
});
window.addEventListener("offline",()=>updateSyncStatus("Offline mode: changes stay on this device."));
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState === "visible"){
    syncPendingProfiles().then(loadProfiles).catch(()=>{});
  }
});

LearnerOffline.registerServiceWorker().catch(()=>{});
if(window.teacherEntryAllowed !== false){
  loadTeacherDirectory();
  loadPersonnelSource();
  loadCurrentTeacher();
  loadProfiles();
}
