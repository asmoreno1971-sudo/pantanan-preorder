const TEACHERS = {
  "0 GOLD A":{ name:"CHARLEY A. EMPESTAN", department:"Elementary" },
  "0 GOLD B":{ name:"ROXAN C. FIGUEROA", department:"Elementary" },
  "1 AMBER":{ name:"JOAN S. QUITOS", department:"Elementary" },
  "1 PEARL":{ name:"ROSELYN D. SANTILLAN", department:"Elementary" },
  "1 RUBY":{ name:"LORRAINE GRACE S. PETROLA", department:"Elementary" },
  "2 JADE":{ name:"EDEN P. BARCEBAS", department:"Elementary" },
  "2 OPAL":{ name:"ANGEL HELLARES ZAFRA", department:"Elementary" },
  "2 QUARTZ":{ name:"GINA M. MUYUELA", department:"Elementary" },
  "3 EMERALD":{ name:"BENITA T. LIZADA", department:"Elementary" },
  "3 SAPPHIRE":{ name:"ZARAH C. CAPINIG", department:"Elementary" },
  "4 CITRINE":{ name:"JANICE G. REMANDABAN", department:"Elementary" },
  "4 TURQUOISE":{ name:"GIRLY G. ALBUYA", department:"Elementary" },
  "5 AMETHYST":{ name:"DARLYN JOY C. HERRERA", department:"Elementary" },
  "5 PERIDOT":{ name:"LOVELLA S. FUENTES", department:"Elementary" },
  "6 BERYL":{ name:"ANALYN L. PORRAS", department:"Elementary" },
  "6 GARNET":{ name:"JOSIE V. DEVIZA", department:"Elementary" },
  "7 HONESTY":{ name:"JULIE ANN T. VASQUEZ", department:"JHS" },
  "7 RESPECT":{ name:"MARIDEL N. ONATO", department:"JHS" },
  "8 CHARITY":{ name:"CJ D. CORTEZ", department:"JHS" },
  "8 FAITH":{ name:"JYLEN P. ADUANA", department:"JHS" },
  "9 JUSTICE":{ name:"CRISTY R. DENIEGA", department:"JHS" },
  "9 PEACE":{ name:"SANDRA M. DIONIO", department:"JHS" },
  "10 FORTITUDE":{ name:"LORENCE A. TAGACAY", department:"JHS" },
  "10 PRUDENCE":{ name:"RISHELLE G. HURTADA", department:"JHS" }
};

const dashboardRows = document.getElementById("dashboardRows");
const dashboardStatus = document.getElementById("dashboardStatus");
const dashboardDateTime = document.getElementById("dashboardDateTime");
let sectionSummaries = [];

async function loadDashboard(){
  try{
    const response = await fetch("/api/students", { cache:"no-store" });
    const data = await response.json();

    if(!response.ok || !data.ok){
      throw new Error(data.message || "Unable to load learner dashboard.");
    }

    const students = Array.isArray(data.students) ? data.students : [];
    await LearnerOffline.replaceRecords(students);
    sectionSummaries = buildSectionSummaries(students);
    renderOverall(students, sectionSummaries.length);
    renderSections();
    dashboardStatus.textContent = `${students.length.toLocaleString()} learner records loaded`;
  }catch(error){
    const students = await LearnerOffline.loadRecords();
    if(students.length){
      sectionSummaries = buildSectionSummaries(students);
      renderOverall(students, sectionSummaries.length);
      renderSections();
      const pending = await LearnerOffline.pendingCount();
      dashboardStatus.textContent = `Offline: ${students.length.toLocaleString()} saved records${pending ? `, ${pending} change${pending === 1 ? "" : "s"} waiting to sync` : ""}`;
    }else{
      dashboardStatus.textContent = error.message;
      dashboardRows.innerHTML = `<tr><td colspan="12" class="empty-dashboard">${escapeHtml(error.message)}</td></tr>`;
    }
  }
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
      const advisory = TEACHERS[section] || { name:"To be assigned", department:"Not assigned" };
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
if(!navigator.onLine && !LearnerOffline.hasOfflineSession()){
  window.location.replace("/teacher-login?next=/student-dashboard");
}else{
  loadDashboard();
}
window.addEventListener("online", loadDashboard);
