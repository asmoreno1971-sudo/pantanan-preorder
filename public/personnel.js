const personnelList = document.getElementById("personnelList");
const personnelStatus = document.getElementById("personnelStatus");
const personnelCount = document.getElementById("personnelCount");
const personnelSearch = document.getElementById("personnelSearch");
const personnelStorageKey = "bakhawPersonnelProfiles";

let personnel = [];
let refreshInFlight = false;

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

function renderPersonnel(){
  const query = personnelSearch.value.trim().toLowerCase();
  const visible = personnel.filter(item=>String(item.name || "").toLowerCase().includes(query));
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

function loadPersonnel(){
  personnel = savedPersonnel();
  renderPersonnel();
  personnelStatus.textContent = personnel.length
    ? (navigator.onLine ? "Saved personnel shown. Checking for updates." : "Offline mode: saved personnel shown.")
    : (navigator.onLine ? "No saved personnel on this device yet. Checking for updates." : "No offline personnel list is saved on this device yet.");
  refreshPersonnel();
}

personnelSearch.addEventListener("input",renderPersonnel);
window.addEventListener("online",refreshPersonnel);
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState === "visible"){
    refreshPersonnel();
  }
});

LearnerOffline.registerServiceWorker().catch(()=>{});
if(window.teacherEntryAllowed !== false){
  loadPersonnel();
}
