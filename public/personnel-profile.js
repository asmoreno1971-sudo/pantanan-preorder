const profileForm = document.getElementById("personnelProfileForm");
const personnelName = document.getElementById("personnelName");
const profileSyncStatus = document.getElementById("profileSyncStatus");
const profileFormMessage = document.getElementById("profileFormMessage");
const saveProfileButton = document.getElementById("saveProfileButton");
const clearProfileButton = document.getElementById("clearProfileButton");
const dynamicProfileFields = document.getElementById("dynamicProfileFields");

const teacherDirectoryKey = "bakhawTeacherDirectory";
const personnelStorageKey = "bakhawPersonnelProfiles";
const personnelProfilesKey = "bakhawPersonnelProfileRecords";
const personnelFieldsKey = "bakhawPersonnelProfileFields";
const gradeSectionsKey = "bakhawGradeSections";
const pendingProfilesKey = "bakhawPersonnelProfilePending";
const currentTeacherKey = "bakhawCurrentTeacherSession";
const specialAssignmentOptions = ["Special Teacher - Elementary", "Special Teacher - JHS"];

let teacherDirectory = [];
let officialPersonnel = [];
let profiles = [];
let profileFields = normalizeProfileFields(storageList(personnelFieldsKey));
let gradeSections = storageList(gradeSectionsKey);
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

function fieldId(label){
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}

function normalizeProfileFields(fields){
  const source = Array.isArray(fields) && fields.length ? fields : defaultProfileFields();
  return source
    .map((field,index)=>{
      const label = normalizeName(field?.label || field?.name || field || "");
      return {
        id:fieldId(field?.id || label) || `field-${index + 1}`,
        label
      };
    })
    .filter(field=>field.label && field.id !== "name");
}

function defaultProfileFields(){
  return [
    "Sex",
    "Birthday",
    "Position",
    "Department",
    "Advisory / Assignment",
    "Contact Number",
    "DepEd Email",
    "Address",
    "Emergency Contact",
    "Employee No.",
    "GSIS",
    "PhilHealth",
    "TIN",
    "PAG-IBIG",
    "PRC License No.",
    "Notes"
  ].map(label=>({ id:fieldId(label), label }));
}

function normalizeName(value){
  return String(value || "").trim().replace(/\s+/g," ");
}

function isDateField(field){
  return field?.id === "birthday" || String(field?.id || "").includes("date");
}

function formatDateValue(value){
  const cleanValue = String(value || "").trim();
  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(isoMatch){
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }
  const slashMatch = cleanValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if(slashMatch){
    const year = slashMatch[3].length === 2 ? `19${slashMatch[3]}` : slashMatch[3];
    return `${slashMatch[1].padStart(2,"0")}/${slashMatch[2].padStart(2,"0")}/${year}`;
  }
  return cleanValue;
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

function currentTeacherCanSaveProfile(name){
  return samePersonName(name, currentTeacherName || personnelName.value);
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
  const fields = Object.fromEntries(profileFields.map(field=>[field.id, ""]));
  return {
    name,
    fields,
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
  const savedProfile = profiles.find(profile=>profileKey(profile.name) === key)
    || profiles.find(profile=>samePersonName(profile.name, officialName));
  return savedProfile ? { ...savedProfile, name:officialName } : blankProfile(officialName);
}

function legacyProfileValue(profile, id){
  const legacyValues = {
    sex:profile.sex,
    birthday:profile.birthday,
    position:profile.position,
    department:profile.department,
    "advisory-assignment":profile.advisory,
    "contact-number":profile.contactNumber,
    "deped-email":profile.depedEmail,
    address:profile.address,
    "emergency-contact":profile.emergencyContact,
    "employee-no":profile.employeeNumber,
    gsis:profile.gsis,
    philhealth:profile.philHealth,
    tin:profile.tin,
    "pag-ibig":profile.pagibig,
    "prc-license-no":profile.prcLicense,
    notes:profile.notes
  };
  return legacyValues[id] || "";
}

function setFormProfile(profile){
  personnelName.value = profile.name || "";
  profileFields.forEach(field=>{
    const input = profileForm.elements[`field:${field.id}`];
    if(input){
      const value = profile.fields?.[field.id] || profile[field.id] || legacyProfileValue(profile, field.id) || "";
      const displayValue = isDateField(field) ? formatDateValue(value) : value;
      if(input.tagName === "SELECT" && displayValue && ![...input.options].some(option=>option.value === displayValue)){
        input.appendChild(new Option(displayValue, displayValue));
      }
      input.value = displayValue;
      if(isDateField(field)){
        const picker = dynamicProfileFields.querySelector(`[data-date-for="field:${field.id}"]`);
        if(picker){
          picker.value = parseMmDdYyyy(displayValue);
        }
      }
      autoResizeTextarea(input);
    }
  });
}

function profileFromForm(){
  const formData = new FormData(profileForm);
  const profile = blankProfile(normalizeName(formData.get("name")));
  profileFields.forEach(field=>{
    const value = String(formData.get(`field:${field.id}`) || "").trim();
    profile.fields[field.id] = isDateField(field) ? formatDateValue(value) : value;
  });
  profile.sex = profile.fields.sex || "";
  profile.birthday = profile.fields.birthday || "";
  profile.position = profile.fields.position || "";
  profile.department = profile.fields.department || "";
  profile.advisory = profile.fields["advisory-assignment"] || "";
  profile.contactNumber = profile.fields["contact-number"] || "";
  profile.depedEmail = String(profile.fields["deped-email"] || "").toLowerCase();
  profile.address = profile.fields.address || "";
  profile.emergencyContact = profile.fields["emergency-contact"] || "";
  profile.employeeNumber = profile.fields["employee-no"] || "";
  profile.gsis = profile.fields.gsis || "";
  profile.philHealth = profile.fields.philhealth || "";
  profile.tin = profile.fields.tin || "";
  profile.pagibig = profile.fields["pag-ibig"] || "";
  profile.prcLicense = profile.fields["prc-license-no"] || "";
  profile.notes = profile.fields.notes || "";
  profile.updatedAt = new Date().toISOString();
  return profile;
}

function renderProfileFields(){
  dynamicProfileFields.innerHTML = profileFields.map(field=>`
    <section class="form-section dynamic-field-section">
      <h3>${escapeHtml(field.label)}</h3>
      <label>
        ${fieldInputMarkup(field)}
      </label>
    </section>
  `).join("");
  dynamicProfileFields.querySelectorAll("textarea").forEach(textarea=>{
    textarea.addEventListener("input",()=>autoResizeTextarea(textarea));
    autoResizeTextarea(textarea);
  });
  bindDatePickers();
  if(currentTeacherName || personnelName.value){
    setFormProfile(currentProfileForName(currentTeacherName || personnelName.value));
  }
}

function fieldInputMarkup(field){
  if(field.id === "sex"){
    return sexSelectMarkup(field);
  }
  if(isDateField(field)){
    return dateInputMarkup(field);
  }
  if(field.id === "advisory-assignment"){
    return advisorySelectMarkup(field);
  }
  if(field.id === "year-started-at-deped"){
    return yearStartedSelectMarkup(field);
  }
  return answerTextareaMarkup(field);
}

function answerTextareaMarkup(field){
  return `<textarea name="field:${escapeHtml(field.id)}" rows="1" placeholder="Enter ${escapeHtml(field.label)}"></textarea>`;
}

function sexSelectMarkup(field){
  return `
    <select name="field:${escapeHtml(field.id)}">
      <option value="">Select Sex</option>
      <option>Male</option>
      <option>Female</option>
    </select>`;
}

function dateInputMarkup(field){
  const escapedId = escapeHtml(field.id);
  return `
    <div class="date-input-wrap">
      <input name="field:${escapedId}" type="text" inputmode="numeric" maxlength="10" placeholder="MM/DD/YYYY" autocomplete="off">
      <input class="date-picker-input" data-date-for="field:${escapedId}" type="date" tabindex="-1" aria-label="Pick ${escapeHtml(field.label)}">
    </div>`;
}

function yearStartedSelectMarkup(field){
  const currentYear = new Date().getFullYear();
  const options = Array.from({ length:currentYear - 1980 + 1 },(_,index)=>String(1980 + index))
    .map(year=>`<option value="${year}">${year}</option>`)
    .join("");
  return `
    <select name="field:${escapeHtml(field.id)}">
      <option value="">Select Year</option>
      ${options}
    </select>`;
}

function advisorySelectMarkup(field){
  const choices = [...new Map([...gradeSections, ...specialAssignmentOptions]
    .map(section=>String(section || "").trim())
    .filter(Boolean)
    .map(section=>[section.toLowerCase(), section])).values()];
  const options = choices.map(section=>`<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`).join("");
  return `
    <select name="field:${escapeHtml(field.id)}">
      <option value="">Select Grade / Section</option>
      ${options}
    </select>`;
}

function parseMmDdYyyy(value){
  const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : "";
}

function bindDatePickers(){
  dynamicProfileFields.querySelectorAll(".date-picker-input").forEach(picker=>{
    const input = profileForm.elements[picker.dataset.dateFor];
    if(!input){
      return;
    }
    picker.value = parseMmDdYyyy(input.value);
    input.addEventListener("input",()=>{
      input.value = input.value.replace(/[^\d/]/g,"").slice(0,10);
      picker.value = parseMmDdYyyy(formatDateValue(input.value));
    });
    input.addEventListener("blur",()=>{
      input.value = formatDateValue(input.value);
      picker.value = parseMmDdYyyy(input.value);
    });
    picker.addEventListener("change",()=>{
      input.value = formatDateValue(picker.value);
    });
  });
}

function autoResizeTextarea(textarea){
  if(!textarea || textarea.tagName !== "TEXTAREA"){
    return;
  }
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function upsertLocalProfile(profile){
  const officialName = matchingOfficialName(profile.name) || profile.name;
  profile.name = officialName;
  const key = profileKey(officialName);
  const index = profiles.findIndex(item=>profileKey(item.name) === key || samePersonName(item.name, officialName));
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
  const officialProfiles = officialPersonnelNames().map(name=>{
    const savedProfile = profilesByName.get(profileKey(name))
      || profiles.find(profile=>samePersonName(profile.name, name));
    return savedProfile ? { ...savedProfile, name } : blankProfile(name);
  });
  const extraProfiles = profiles.filter(profile=>!officialPersonnelNames().some(name=>samePersonName(profile.name, name)));
  profiles = [...officialProfiles, ...extraProfiles];
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

async function loadGradeSections(){
  gradeSections = storageList(gradeSectionsKey);
  if(gradeSections.length){
    renderProfileFields();
  }
  if(!navigator.onLine){
    return;
  }
  try{
    const response = await profileFetch("/api/grade-sections", { cache:"no-store" });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Grade / Sections could not be loaded.");
    }
    gradeSections = Array.isArray(data.sections) ? data.sections : [];
    saveStorageList(gradeSectionsKey, gradeSections);
    renderProfileFields();
  }catch{
    // Saved Grade / Sections remain the offline fallback.
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
      if(Array.isArray(data.fields)){
        profileFields = normalizeProfileFields(data.fields);
        saveStorageList(personnelFieldsKey, profileFields);
        renderProfileFields();
      }
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
    if(Array.isArray(data.fields)){
      profileFields = normalizeProfileFields(data.fields);
      saveStorageList(personnelFieldsKey, profileFields);
      renderProfileFields();
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
  if(officialPersonnel.length && !matchingOfficialName(profile.name) && !currentTeacherCanSaveProfile(profile.name)){
    profileFormMessage.textContent = "Your name is not listed in the teacher directory.";
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
  renderProfileFields();
  loadTeacherDirectory();
  loadGradeSections();
  loadPersonnelSource();
  loadCurrentTeacher();
  loadProfiles();
}
