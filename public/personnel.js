const personnelList = document.getElementById("personnelList");
const personnelStatus = document.getElementById("personnelStatus");
const personnelCount = document.getElementById("personnelCount");
const personnelSearch = document.getElementById("personnelSearch");
const personnelStorageKey = "bakhawPersonnelProfiles";
const personnelRecordsKey = "bakhawPersonnelProfileRecords";
const personnelFieldsKey = "bakhawPersonnelProfileFields";
const teacherDirectoryKey = "bakhawTeacherDirectory";
const personnelPhotosKey = "bakhawPersonnelProfilePhotos";
const personnelConsolePassword = "1111";
const personnelConsoleUnlockKey = "bakhawPersonnelConsoleUnlocked";

let personnel = [];
let teacherDirectory = [];
let profileFields = [];
let refreshInFlight = false;
let directoryRefreshInFlight = false;

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function savedPersonnel(){
  try{
    const savedRecords = JSON.parse(localStorage.getItem(personnelRecordsKey) || "[]");
    if(Array.isArray(savedRecords) && savedRecords.length){
      return savedRecords;
    }
    const saved = JSON.parse(localStorage.getItem(personnelStorageKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  }catch{
    return [];
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

function savedProfileFields(){
  try{
    const saved = JSON.parse(localStorage.getItem(personnelFieldsKey) || "[]");
    return Array.isArray(saved) ? saved : [];
  }catch{
    return [];
  }
}

function savedPersonnelPhotos(){
  try{
    const saved = JSON.parse(localStorage.getItem(personnelPhotosKey) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  }catch{
    return {};
  }
}

function normalizeName(value){
  return String(value || "").trim().replace(/\s+/g," ").toLowerCase();
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

function fieldId(label){
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
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

function normalizeProfileFields(fields){
  const source = Array.isArray(fields) && fields.length ? fields : defaultProfileFields();
  return source.map((field,index)=>{
    const label = String(field?.label || field?.name || field || "").trim();
    const options = Array.isArray(field?.options) ? field.options : [];
    return {
      id:fieldId(field?.id || label) || `field-${index + 1}`,
      label,
      options:[...new Map(options
        .map(option=>String(option || "").trim())
        .filter(Boolean)
        .map(option=>[option.toLowerCase(), option])).values()]
    };
  }).filter(field=>field.label && field.id !== "name");
}

function nameTokens(name){
  return normalizeName(name)
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

function teacherDisplayName(teacher){
  return String(teacher?.displayName || teacher?.name || teacher?.username || "").trim();
}

function displayValue(value){
  const cleanValue = String(value || "").trim();
  return cleanValue ? escapeHtml(cleanValue) : `<span class="missing-value">Not saved</span>`;
}

function savedPhotoForPersonnel(name){
  const photos = savedPersonnelPhotos();
  const key = normalizeName(name);
  return photos[key]?.dataUrl
    || Object.values(photos).find(photo=>samePersonName(photo?.name, name))?.dataUrl
    || "";
}

function profileDetails(profile){
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
  return profileFields.map(field=>{
    const value = profile.fields?.[field.id] || profile[field.id] || legacyValues[field.id] || "";
    return [field.label, isDateField(field) ? formatDateValue(value) : value];
  });
}

function hasSavedDetails(profile){
  return profileDetails(profile).some(([,value])=>String(value || "").trim());
}

function profileCard(profile,index,expanded = false){
  const details = profileDetails(profile);
  const summaryFields = expanded ? details : details.filter(([,value])=>String(value || "").trim()).slice(0, 4);
  const profileUrl = `/personnel-profile?name=${encodeURIComponent(profile.name || "")}`;
  const photoUrl = savedPhotoForPersonnel(profile.name);
  return `
    <article class="personnel-card ${expanded ? "personnel-card-expanded" : ""}">
      <div class="personnel-card-heading">
        ${photoUrl ? `<img class="personnel-card-photo" src="${escapeHtml(photoUrl)}" alt="">` : ""}
        ${expanded ? "" : `<span class="personnel-number">${index + 1}</span>`}
        <div>
          <h3 class="personnel-name">${escapeHtml(profile.name || "Unnamed personnel")}</h3>
          <p>${hasSavedDetails(profile) ? "Saved personnel profile" : "No saved profile details yet"}</p>
        </div>
        <a class="personnel-profile-link" href="${profileUrl}">Open Profile</a>
      </div>
      <dl class="profile-details">
        ${summaryFields.map(([label,value])=>`
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${displayValue(value)}</dd>
          </div>
        `).join("")}
      </dl>
    </article>`;
}

function renderTeacherDropdown(){
  const current = personnelSearch.value;
  const names = (personnel.length ? personnel.map(item=>item.name) : teacherDirectory.map(teacherDisplayName))
    .map(name=>String(name || "").trim())
    .filter(Boolean);
  const uniqueNames = [...new Map(names.map(name=>[normalizeName(name),name])).values()]
    .sort((a,b)=>a.localeCompare(b));

  personnelSearch.innerHTML = `<option value="">All teachers</option>${uniqueNames
    .map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
    .join("")}`;

  if([...personnelSearch.options].some(option=>option.value === current)){
    personnelSearch.value = current;
  }
}

function renderPersonnel(){
  const selected = normalizeName(personnelSearch.value);
  if(!selected){
    personnelCount.textContent = `${personnel.length.toLocaleString()} personnel`;
    personnelList.classList.remove("personnel-list-selected");
    personnelList.innerHTML = "";
    return;
  }
  const visible = selected
    ? personnel.filter(item=>{
      const name = normalizeName(item.name);
      return name === selected || name.includes(selected) || selected.includes(name)
        || samePersonName(personnelSearch.value, item.name);
    })
    : personnel;
  personnelCount.textContent = `${visible.length.toLocaleString()} personnel`;
  personnelList.classList.toggle("personnel-list-selected", Boolean(selected));
  personnelList.innerHTML = visible.length
    ? visible.map((item,index)=>profileCard(item,index,Boolean(selected))).join("")
    : `<div class="empty-card">No personnel found.</div>`;
}

function ensurePersonnelConsoleAccess(){
  if(sessionStorage.getItem(personnelConsoleUnlockKey) === "yes"){
    sessionStorage.removeItem(personnelConsoleUnlockKey);
    return true;
  }
  const pin = window.prompt("Enter Personnel Consol password:");
  if(pin === personnelConsolePassword){
    return true;
  }
  window.location.replace("/student-dashboard");
  return false;
}

async function personnelFetch(url, timeoutMs = 3000){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{cache:"no-store",signal:controller.signal});
  }finally{
    window.clearTimeout(timeout);
  }
}

async function refreshPersonnel(){
  if(refreshInFlight || !navigator.onLine){
    return;
  }
  refreshInFlight = true;
  try{
    const response = await personnelFetch("/api/personnel-profiles");
    const data = await response.json();
    if(response.status === 401){
      window.location.replace(`/login?next=${encodeURIComponent("/personnel")}`);
      return;
    }
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Personnel list could not be loaded.");
    }
    if(Array.isArray(data.fields)){
      profileFields = normalizeProfileFields(data.fields);
      localStorage.setItem(personnelFieldsKey,JSON.stringify(profileFields));
    }
    personnel = Array.isArray(data.profiles) ? data.profiles : (Array.isArray(data.personnel) ? data.personnel : []);
    localStorage.setItem(personnelRecordsKey,JSON.stringify(personnel));
    localStorage.setItem(personnelStorageKey,JSON.stringify(personnel));
    renderTeacherDropdown();
    renderPersonnel();
    personnelStatus.textContent = `${personnel.length.toLocaleString()} saved personnel profile${personnel.length === 1 ? "" : "s"} loaded.`;
  }catch(error){
    personnelStatus.textContent = personnel.length
      ? "Saved personnel profiles shown. Reconnect to refresh."
      : (error.message || "Personnel list could not be loaded.");
  }finally{
    refreshInFlight = false;
  }
}

async function refreshTeacherDirectory(){
  if(directoryRefreshInFlight || !navigator.onLine){
    return;
  }
  directoryRefreshInFlight = true;
  try{
    const response = await personnelFetch("/api/teacher-directory");
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Teacher list could not be loaded.");
    }
    teacherDirectory = Array.isArray(data.teachers) ? data.teachers : [];
    localStorage.setItem(teacherDirectoryKey,JSON.stringify(teacherDirectory));
    renderTeacherDropdown();
    renderPersonnel();
  }catch{
    if(!teacherDirectory.length){
      teacherDirectory = savedTeacherDirectory();
      renderTeacherDropdown();
    }
  }finally{
    directoryRefreshInFlight = false;
  }
}

function loadPersonnel(){
  personnel = savedPersonnel();
  teacherDirectory = savedTeacherDirectory();
  profileFields = normalizeProfileFields(savedProfileFields());
  renderTeacherDropdown();
  renderPersonnel();
  personnelStatus.textContent = personnel.length
    ? (navigator.onLine ? "Saved personnel shown. Checking for updates." : "Offline mode: saved personnel shown.")
    : (navigator.onLine ? "No saved personnel on this device yet. Checking for updates." : "No offline personnel list is saved on this device yet.");
  refreshTeacherDirectory();
  refreshPersonnel();
}

personnelSearch.addEventListener("change",renderPersonnel);
window.addEventListener("online",()=>{
  refreshTeacherDirectory();
  refreshPersonnel();
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState === "visible"){
    refreshTeacherDirectory();
    refreshPersonnel();
  }
});

LearnerOffline.registerServiceWorker().catch(()=>{});
if(window.teacherEntryAllowed !== false && ensurePersonnelConsoleAccess()){
  loadPersonnel();
}
