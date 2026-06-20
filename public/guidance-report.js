const reportStatus = document.getElementById("reportStatus");
const levelTallyBody = document.getElementById("levelTallyBody");
const levelTallyFoot = document.getElementById("levelTallyFoot");
const incidentTallyBody = document.getElementById("incidentTallyBody");
const incidentTallyFoot = document.getElementById("incidentTallyFoot");
const reportMonth = document.getElementById("reportMonth");
const reportYear = document.getElementById("reportYear");
const selectedPeriod = document.getElementById("selectedPeriod");
let allCases = [];
let reportRefreshInFlight = false;
let lastReportRefresh = 0;

function guidanceApiUrl(pathname){
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set("fresh", String(Date.now()));
  return `${url.pathname}${url.search}`;
}

const incidentTypes = [
  { label:"Physical", aliases:["physical","physical bullying"] },
  { label:"Social", aliases:["social","social / relational aggression"] },
  { label:"Gender-based", aliases:["gender-based","gender-based bullying","gender based bullying"] },
  { label:"Cyber Bullying", aliases:["cyber bullying","cyberbullying"] },
  { label:"Retaliation", aliases:["retaliation"] },
  { label:"Psychological or Emotional Bullying", aliases:["psychological bullying","psychological or emotional bullying","emotional bullying"] },
  { label:"Verbal Bullying", aliases:["verbal bullying"] }
];
const monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function blankCounts(){
  return { boys:0, girls:0, unspecified:0, total:0 };
}

function learnerLevel(guidanceCase){
  const gradeSection = guidanceCase?.primaryStudent?.gradeSection || "";
  const grade = Number(String(gradeSection).match(/^\d+/)?.[0]);
  if(Number.isFinite(grade) && grade >= 7){
    return "JHS";
  }
  if(Number.isFinite(grade)){
    return "Elementary";
  }
  return guidanceCase?.guidanceLevel === "JHS" ? "JHS" : "Elementary";
}

function learnerSex(guidanceCase){
  const sex = String(guidanceCase?.primaryStudent?.sex || "").trim().toUpperCase();
  if(["MALE","M","BOY"].includes(sex)){
    return "boys";
  }
  if(["FEMALE","F","GIRL"].includes(sex)){
    return "girls";
  }
  return "unspecified";
}

function incidentIndex(value){
  const normalized = String(value || "").trim().toLowerCase();
  return incidentTypes.findIndex(type=>type.aliases.includes(normalized));
}

function incidentPeriod(guidanceCase){
  const match = String(guidanceCase?.incidentDate || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
  return match ? { year:Number(match[1]), month:Number(match[2]) } : null;
}

function setupPeriodFilters(cases){
  const periods = cases.map(incidentPeriod).filter(Boolean);
  const latest = periods.sort((a,b)=>b.year - a.year || b.month - a.month)[0];
  const now = new Date();
  const selectedYear = Number(reportYear.value) || latest?.year || now.getFullYear();
  const selectedMonth = Number(reportMonth.value) || latest?.month || now.getMonth() + 1;
  const years = [...new Set(periods.map(period=>period.year))].sort((a,b)=>b-a);
  if(!years.length){
    years.push(now.getFullYear());
  }
  reportMonth.innerHTML = monthNames.map((month,index)=>
    `<option value="${index + 1}">${month}</option>`
  ).join("");
  reportYear.innerHTML = years.map(year=>`<option value="${year}">${year}</option>`).join("");
  reportMonth.value = String(selectedMonth);
  reportYear.value = String(years.includes(selectedYear) ? selectedYear : years[0]);
}

function selectedCases(){
  const month = Number(reportMonth.value);
  const year = Number(reportYear.value);
  return allCases.filter(guidanceCase=>{
    const period = incidentPeriod(guidanceCase);
    return period?.month === month && period?.year === year;
  });
}

function renderSelectedPeriod(){
  selectedPeriod.textContent = `${monthNames[Number(reportMonth.value) - 1]} ${reportYear.value}`;
  renderReport(selectedCases());
}

function addCount(counts, sex){
  counts[sex] += 1;
  counts.total += 1;
}

function sumCounts(...items){
  return items.reduce((total,item)=>{
    total.boys += item.boys;
    total.girls += item.girls;
    total.unspecified += item.unspecified;
    total.total += item.total;
    return total;
  },blankCounts());
}

function displayCount(value){
  return Number(value) === 0 ? "" : value;
}

function renderReport(cases){
  const levels = {
    Elementary:blankCounts(),
    JHS:blankCounts()
  };
  const incidents = incidentTypes.map(()=>({
    Elementary:blankCounts(),
    JHS:blankCounts()
  }));

  cases.forEach(guidanceCase=>{
    const level = learnerLevel(guidanceCase);
    const sex = learnerSex(guidanceCase);
    addCount(levels[level],sex);
    const typeIndex = incidentIndex(guidanceCase.aggressionType);
    if(typeIndex >= 0){
      addCount(incidents[typeIndex][level],sex);
    }
  });

  const overall = sumCounts(levels.Elementary,levels.JHS);

  levelTallyBody.innerHTML = ["Elementary","JHS"].map(level=>`
    <tr>
      <td>${level}</td>
      <td>${displayCount(levels[level].boys)}</td>
      <td>${displayCount(levels[level].girls)}</td>
      <td>${displayCount(levels[level].unspecified)}</td>
      <td>${displayCount(levels[level].total)}</td>
    </tr>`).join("");
  levelTallyFoot.innerHTML = `
    <tr>
      <td>Overall</td>
      <td>${displayCount(overall.boys)}</td>
      <td>${displayCount(overall.girls)}</td>
      <td>${displayCount(overall.unspecified)}</td>
      <td>${displayCount(overall.total)}</td>
    </tr>`;

  incidentTallyBody.innerHTML = incidentTypes.map((type,index)=>{
    const elementary = incidents[index].Elementary;
    const jhs = incidents[index].JHS;
    return `
      <tr>
        <td>${type.label}</td>
        <td>${displayCount(elementary.boys)}</td>
        <td>${displayCount(elementary.girls)}</td>
        <td>${displayCount(elementary.total)}</td>
        <td>${displayCount(jhs.boys)}</td>
        <td>${displayCount(jhs.girls)}</td>
        <td>${displayCount(jhs.total)}</td>
        <td>${displayCount(elementary.total + jhs.total)}</td>
      </tr>`;
  }).join("");

  const incidentElementary = incidents.reduce((total,item)=>sumCounts(total,item.Elementary),blankCounts());
  const incidentJhs = incidents.reduce((total,item)=>sumCounts(total,item.JHS),blankCounts());
  incidentTallyFoot.innerHTML = `
    <tr>
      <td>Total Listed Incidents</td>
      <td>${displayCount(incidentElementary.boys)}</td>
      <td>${displayCount(incidentElementary.girls)}</td>
      <td>${displayCount(incidentElementary.total)}</td>
      <td>${displayCount(incidentJhs.boys)}</td>
      <td>${displayCount(incidentJhs.girls)}</td>
      <td>${displayCount(incidentJhs.total)}</td>
      <td>${displayCount(incidentElementary.total + incidentJhs.total)}</td>
    </tr>`;

  document.getElementById("generatedDate").textContent = selectedPeriod.textContent;
  const unclassified = overall.total - incidentElementary.total - incidentJhs.total;
  reportStatus.textContent = unclassified > 0
    ? `${overall.total} case${overall.total === 1 ? "" : "s"} for ${selectedPeriod.textContent}. ${unclassified} use an incident type outside the seven listed categories.`
    : `${overall.total} guidance case${overall.total === 1 ? "" : "s"} for ${selectedPeriod.textContent}.`;
}

async function loadReport(){
  if(reportRefreshInFlight){
    return;
  }
  reportRefreshInFlight = true;
  lastReportRefresh = Date.now();
  try{
  if(!navigator.onLine){
    const cases = await LearnerOffline.loadGuidanceCases();
    allCases = Array.isArray(cases) ? cases : [];
    setupPeriodFilters(allCases);
    renderSelectedPeriod();
    reportStatus.textContent += " Offline data shown.";
    return;
  }

  try{
    allCases = [];
    setupPeriodFilters(allCases);
    renderSelectedPeriod();
    reportStatus.textContent = "Loading online guidance cases...";
    const controller = new AbortController();
    const timeout = window.setTimeout(()=>controller.abort(),20000);
    let response;
    try{
      response = await fetch(guidanceApiUrl("/api/guidance-cases"),{cache:"no-store",signal:controller.signal});
    }finally{
      window.clearTimeout(timeout);
    }
    const data = await response.json();
    if(response.status === 401 || response.status === 403){
      reportStatus.textContent += " Online session needs refresh; saved report data remains available here.";
      return;
    }
    if(!response.ok || !data.ok){
      throw new Error(data.message || "The latest cases could not be loaded.");
    }
    const latestCases = Array.isArray(data.cases) ? data.cases : [];
    await LearnerOffline.replaceGuidanceCases(latestCases);
    localStorage.removeItem("bakhaw-guidance-case-backup");
    allCases = latestCases;
    setupPeriodFilters(allCases);
    renderSelectedPeriod();
  }catch(error){
    if(!(error instanceof TypeError) && error?.name !== "AbortError"){
      reportStatus.textContent = error.message;
    }else{
      reportStatus.textContent += " Saved offline data remains available.";
    }
  }
  }finally{
    reportRefreshInFlight = false;
  }
}

document.getElementById("printReport").addEventListener("click",()=>window.print());
reportMonth.addEventListener("change",renderSelectedPeriod);
reportYear.addEventListener("change",renderSelectedPeriod);

if(window.teacherEntryAllowed !== false){
  loadReport();
}
window.addEventListener("online",loadReport);
window.addEventListener("pageshow",()=>{
  if(Date.now() - lastReportRefresh > 15000){
    loadReport();
  }
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState === "visible" && Date.now() - lastReportRefresh > 15000){
    loadReport();
  }
});
LearnerOffline.onDataUpdated?.(async update=>{
  if(update?.type !== "guidance" || reportRefreshInFlight){
    return;
  }
  allCases = await LearnerOffline.loadGuidanceCases();
  setupPeriodFilters(allCases);
  renderSelectedPeriod();
});
window.setInterval(()=>{
  if(document.visibilityState === "visible" && Date.now() - lastReportRefresh > 60000){
    loadReport();
  }
},15000);
