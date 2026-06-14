const dashboardRows = document.getElementById("dashboardRows");
const dashboardStatus = document.getElementById("dashboardStatus");
const dashboardDateTime = document.getElementById("dashboardDateTime");
let sectionSummaries = [];
let advisoryDirectory = {};
let dashboardRefreshInFlight = false;

async function fetchJson(url, timeoutMs = 8000){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(), timeoutMs);
  try{
    const response = await fetch(url, { cache:"no-store", signal:controller.signal });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Dashboard information could not be loaded.");
    }
    return data;
  }finally{
    window.clearTimeout(timeout);
  }
}

function savedAdvisoryDirectory(){
  try{
    const saved = JSON.parse(localStorage.getItem("bakhawAdvisoryDirectory") || "{}");
    return saved && typeof saved === "object" ? saved : {};
  }catch{
    return {};
  }
}

async function loadAdvisoryDirectory(){
  try{
    const data = await fetchJson("/api/advisory-directory");
    advisoryDirectory = Object.fromEntries((data.advisories || []).map(entry=>[
      entry.gradeSection,
      { name:entry.teacher, department:entry.department || "Not assigned" }
    ]));
    localStorage.setItem("bakhawAdvisoryDirectory", JSON.stringify(advisoryDirectory));
  }catch{
    advisoryDirectory = savedAdvisoryDirectory();
  }
}

async function showCachedDashboard(){
  advisoryDirectory = savedAdvisoryDirectory();
  const students = await LearnerOffline.loadRecords();
  if(!students.length){
    return false;
  }
  sectionSummaries = buildSectionSummaries(students);
  renderOverall(students, sectionSummaries.length);
  renderSections();
  const pending = await LearnerOffline.pendingCount();
  dashboardStatus.textContent = `${students.length.toLocaleString()} saved learner records${pending ? `, ${pending} change${pending === 1 ? "" : "s"} waiting to sync` : ""}`;
  return true;
}

async function refreshDashboard(){
  if(dashboardRefreshInFlight || !navigator.onLine){
    return;
  }
  dashboardRefreshInFlight = true;
  try{
    const [data] = await Promise.all([
      fetchJson("/api/students"),
      loadAdvisoryDirectory()
    ]);
    const serverStudents = Array.isArray(data.students) ? data.students : [];
    const pending = await LearnerOffline.pendingCount();
    if(!pending){
      await LearnerOffline.replaceRecords(serverStudents);
    }
    const students = pending ? await LearnerOffline.loadRecords() : serverStudents;
    sectionSummaries = buildSectionSummaries(students);
    renderOverall(students, sectionSummaries.length);
    renderSections();
    dashboardStatus.textContent = pending
      ? `${students.length.toLocaleString()} learner records, ${pending} change${pending === 1 ? "" : "s"} waiting to sync`
      : `${students.length.toLocaleString()} learner records loaded`;
  }catch(error){
    const students = await LearnerOffline.loadRecords();
    if(students.length){
      advisoryDirectory = savedAdvisoryDirectory();
      sectionSummaries = buildSectionSummaries(students);
      renderOverall(students, sectionSummaries.length);
      renderSections();
      const pending = await LearnerOffline.pendingCount();
      dashboardStatus.textContent = `Offline: ${students.length.toLocaleString()} saved records${pending ? `, ${pending} change${pending === 1 ? "" : "s"} waiting to sync` : ""}`;
    }else{
      dashboardStatus.textContent = error.message;
      dashboardRows.innerHTML = `<tr><td colspan="12" class="empty-dashboard">${escapeHtml(error.message)}</td></tr>`;
    }
  }finally{
    dashboardRefreshInFlight = false;
  }
}

async function loadDashboard(){
  const cached = await showCachedDashboard();
  if(!cached){
    dashboardStatus.textContent = navigator.onLine ? "Loading learner records..." : "No saved learner records are available offline yet.";
  }
  await refreshDashboard();
}

function buildSectionSummaries(students){
  const grouped = new Map();

  students.forEach(student=>{
    const section = student.gradeSection || "UNASSIGNED";

    if(!grouped.has(section)){
      grouped.set(section, []);
    }

    grouped.get(section).push(student);
  });

  return [...grouped.entries()]
    .map(([section, records])=>{
      const advisory = advisoryDirectory[section] || { name:"To be assigned", department:"Not assigned" };
      return {
        section,
        teacher:advisory.name,
        department:advisory.department,
        total:records.length,
        male:countBy(records, "sex", "MALE"),
        female:countBy(records, "sex", "FEMALE")
      };
    })
    .sort((a, b)=>a.section.localeCompare(b.section, undefined, { numeric:true }));
}

function renderOverall(students, sectionCount){
  const male = countBy(students, "sex", "MALE");
  const female = countBy(students, "sex", "FEMALE");

  setText("overallStudents", students.length);
  setText("overallSections", sectionCount);
  setText("overallMale", male);
  setText("overallFemale", female);
  setText("overallUnspecified", Math.max(0, students.length - male - female));

  for(let code = 1; code <= 5; code += 1){
    setText(`status${code}Total`, countBy(students, "statusCode", String(code)));
  }

  setText("statusBlankTotal", students.filter(student=>!String(student.statusCode || "").trim()).length);
}

function renderSections(){
  if(!sectionSummaries.length){
    dashboardRows.innerHTML = `<tr><td colspan="7" class="empty-dashboard">No grade or section data is available.</td></tr>`;
    return;
  }

  dashboardRows.innerHTML = sectionSummaries.map(summary=>`
    <tr>
      <td class="section-name">${escapeHtml(summary.section)}</td>
      <td><span class="teacher-placeholder">${escapeHtml(summary.teacher)}</span></td>
      <td><span class="department-badge ${summary.department === "JHS" ? "jhs" : ""}">${escapeHtml(summary.department)}</span></td>
      <td class="number total-number">${summary.total.toLocaleString()}</td>
      <td class="number male-number">${summary.male.toLocaleString()}</td>
      <td class="number female-number">${summary.female.toLocaleString()}</td>
      <td><a class="view-section" href="/students?section=${encodeURIComponent(summary.section)}">View</a></td>
    </tr>
  `).join("");
}

function countBy(records, field, value){
  return records.filter(record=>String(record[field] || "").toUpperCase() === value).length;
}

function setText(id, value){
  document.getElementById(id).textContent = Number(value || 0).toLocaleString();
}

function updateDashboardClock(){
  const now = new Date();
  const month = now.toLocaleDateString("en-US", { month:"short" });
  const day = String(now.getDate()).padStart(2, "0");
  const year = now.getFullYear();
  const time = now.toLocaleTimeString("en-US", {
    hour:"2-digit",
    minute:"2-digit",
    second:"2-digit",
    hour12:false
  });
  dashboardDateTime.textContent = `${month} ${day}, ${year} ${time}`;
}

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

updateDashboardClock();
window.setInterval(updateDashboardClock, 1000);
LearnerOffline.registerServiceWorker().catch(()=>{});
if(window.teacherEntryAllowed === false){
  // The entry guard is redirecting to Teacher Login.
}else if(!navigator.onLine && !LearnerOffline.hasOfflineSession()){
  window.location.replace("/teacher-login?next=/student-dashboard");
}else{
  loadDashboard();
}
window.addEventListener("online", refreshDashboard);
