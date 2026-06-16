const personnelList = document.getElementById("personnelList");
const personnelStatus = document.getElementById("personnelStatus");
const personnelCount = document.getElementById("personnelCount");
const personnelSearch = document.getElementById("personnelSearch");
const personnelStorageKey = "bakhawPersonnelProfiles";
const teacherDirectoryKey = "bakhawTeacherDirectory";

let personnel = [];
let teacherDirectory = [];
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

function normalizeName(value){
  return String(value || "").trim().replace(/\s+/g," ").toLowerCase();
}

function teacherDisplayName(teacher){
  return String(teacher?.displayName || teacher?.name || teacher?.username || "").trim();
}

function renderTeacherDropdown(){
  const current = personnelSearch.value;
  const names = (teacherDirectory.length ? teacherDirectory.map(teacherDisplayName) : personnel.map(item=>item.name))
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
  const visible = selected
    ? personnel.filter(item=>{
      const name = normalizeName(item.name);
      return name === selected || name.includes(selected) || selected.includes(name);
    })
    : personnel;
  personnelCount.textContent = `${visible.length.toLocaleString()} personnel`;
  personnelList.innerHTML = visible.length ? visible.map((item,index)=>`
    <article class="personnel-card">
      <span class="personnel-number">${index + 1}</span>
      <span class="personnel-name">${escapeHtml(item.name)}</span>
    </article>
  `).join("") : `<div class="empty-card">No personnel found.</div>`;
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
    const response = await personnelFetch("/api/personnel");
    const data = await response.json();
    if(response.status === 401){
      window.location.replace(`/teacher-login?next=${encodeURIComponent("/personnel")}`);
      return;
    }
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Personnel list could not be loaded.");
    }
    personnel = Array.isArray(data.personnel) ? data.personnel : [];
    localStorage.setItem(personnelStorageKey,JSON.stringify(personnel));
    renderTeacherDropdown();
    renderPersonnel();
    personnelStatus.textContent = `${personnel.length.toLocaleString()} personnel loaded from Profile Column A.`;
  }catch(error){
    personnelStatus.textContent = personnel.length
      ? "Saved personnel shown. Reconnect to refresh from the Profile sheet."
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
if(window.teacherEntryAllowed !== false){
  loadPersonnel();
}
