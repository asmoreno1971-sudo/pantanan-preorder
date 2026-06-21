const guidanceForm = document.getElementById("guidanceForm");
const primaryStudent = document.getElementById("primaryStudent");
const studentOptions = document.getElementById("studentOptions");
const primaryStudentMenu = document.getElementById("primaryStudentMenu");
const primaryProfile = document.getElementById("primaryProfile");
const involvedList = document.getElementById("involvedList");
const adviserSummary = document.getElementById("adviserSummary");
const signatoryPreview = document.getElementById("signatoryPreview");
const signatoryReason = document.getElementById("signatoryReason");
const adviserInformed = document.getElementById("adviserInformed");
const adviserInformedAt = document.getElementById("adviserInformedAt");
const adviserInformedPickerButton = document.querySelector('[data-date-picker="adviserInformedAtPicker"]');
const formMessage = document.getElementById("formMessage");
const saveCaseButton = document.getElementById("saveCaseButton");
const caseList = document.getElementById("caseList");
const caseSearch = document.getElementById("caseSearch");
const caseStatusMessage = document.getElementById("caseStatusMessage");
const caseId = document.getElementById("guidanceCaseId");
const caseNumberPreview = document.getElementById("caseNumberPreview");
const formTitle = document.getElementById("formTitle");
const incidentTime = document.getElementById("incidentTime");
const caseReportDialog = document.getElementById("caseReportDialog");
const caseReportSheet = document.getElementById("caseReportSheet");
const consolidationDialog = document.getElementById("consolidationDialog");
const consolidationBody = document.getElementById("consolidationBody");
const consolidationSearch = document.getElementById("consolidationSearch");
const consolidationSummary = document.getElementById("consolidationSummary");

let students = [];
let cases = [];
let advisories = [];
let guidanceLoadInFlight = false;
let guidancePendingSyncInFlight = false;
let guidanceDirectoryRefreshInFlight = false;
let lastGuidanceRefresh = 0;
let lastGuidanceDirectoryRefresh = 0;
let guidanceFormDirty = false;
let guidanceRetryTimer = null;
const advisoryCacheKey = "bakhaw-guidance-advisories";
const guidanceLegacyPurgeKey = "bakhaw-guidance-local-purged-v21";
const databaseErrorPattern = /getaddrinfo|ENOTFOUND|dpg-[a-z0-9-]+|database connection|database is temporarily unavailable/i;

async function guidanceFetch(url, options = {}, timeoutMs = 3000){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(),timeoutMs);
  const headers = new Headers(options.headers || {});
  headers.set("Cache-Control", "no-cache");
  headers.set("Pragma", "no-cache");
  try{
    return await fetch(url,{cache:"no-store",...options,headers,signal:controller.signal});
  }finally{
    window.clearTimeout(timeout);
  }
}

function guidanceApiUrl(pathname){
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set("fresh", String(Date.now()));
  url.searchParams.set("online", "1");
  return `${url.pathname}${url.search}`;
}

function isConnectionFailure(error){
  const message = String(error?.message || "");
  return !navigator.onLine
    || error?.status === 503
    || error instanceof TypeError
    || error?.name === "AbortError"
    || /getaddrinfo|ENOTFOUND|database connection|database is temporarily unavailable|database is unavailable|connection terminated|timeout/i.test(message);
}

function guidanceStorageUnavailableMessage(){
  return navigator.onLine
    ? "Internet is available, but shared Guidance storage is unavailable. Pending cases will keep retrying."
    : "Offline mode: pending Guidance cases stay on this device.";
}

function isGuidanceAuthResponse(response){
  return response && (response.status === 401 || response.status === 403);
}

async function keepGuidancePageOpen(message = "Guidance session needs refresh. Saved cases remain available here."){
  await updateGuidanceSyncStatus(message);
}

function scrubDatabaseErrorMessage(){
  if(formMessage && databaseErrorPattern.test(String(formMessage.textContent || ""))){
    formMessage.textContent = "Guidance case could not be saved online. Please reconnect and try again.";
  }
  if(caseStatusMessage && databaseErrorPattern.test(String(caseStatusMessage.textContent || ""))){
    caseStatusMessage.textContent = "";
  }
}

if(formMessage){
  new MutationObserver(scrubDatabaseErrorMessage).observe(formMessage,{childList:true,subtree:true,characterData:true});
}
if(caseStatusMessage){
  new MutationObserver(scrubDatabaseErrorMessage).observe(caseStatusMessage,{childList:true,subtree:true,characterData:true});
}
scrubDatabaseErrorMessage();
window.addEventListener("load", scrubDatabaseErrorMessage);

function queueGuidanceRetry(delay = 3000){
  if(guidanceRetryTimer || !navigator.onLine){
    return;
  }
  guidanceRetryTimer = window.setTimeout(()=>{
    guidanceRetryTimer = null;
    retryPendingGuidanceSync();
  },delay);
}

const profileFields = [
  ["Grade / Section","gradeSection"],["Sex","sex"],["Age","age"],["Birthday","birthday"],
  ["LRN","lrn"],["Address","address"],["Father","father"],["Mother","mother"],
  ["Guardian","guardian"],["Contact Number","contactNumber"]
];
const roles = [
  "Victim",
  "Perpetrator",
  "Witness",
  "Conniver",
  "Provocator",
  "Personal Issue",
  "To be determined",
  "Learner of Interest"
];

function localIsoDate(){
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2,"0");
  const day = String(date.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

function displayDate(isoDate){
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1].slice(-2)}` : "";
}

function reportDisplayDate(isoDate){
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "";
}

function isoDate(displayValue, label, required = true){
  const value = String(displayValue || "").trim();
  if(!value && !required){
    return "";
  }
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if(!match){
    throw new Error(`${label} must use mm/dd/yy.`);
  }
  const year = 2000 + Number(match[3]);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(year, month - 1, day);
  if(date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day){
    throw new Error(`${label} is not a valid date.`);
  }
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

function formatDateTyping(input){
  const digits = input.value.replace(/\D/g,"").slice(0,6);
  input.value = [digits.slice(0,2),digits.slice(2,4),digits.slice(4,6)].filter(Boolean).join("/");
}

function populateIncidentTimes(){
  const options = [];
  for(let minutes = 7 * 60; minutes <= 16 * 60; minutes += 30){
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const hour12 = hour24 % 12 || 12;
    const period = hour24 < 12 ? "AM" : "PM";
    const value = `${String(hour24).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
    options.push(`<option value="${value}">${hour12}:${String(minute).padStart(2,"0")} ${period}</option>`);
  }
  incidentTime.insertAdjacentHTML("beforeend",options.join(""));
}

function currentIncidentTime(){
  const now = new Date();
  return `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
}

function setIncidentTime(value, suffix = "saved"){
  const savedTime = String(value || "");
  if(savedTime && ![...incidentTime.options].some(option=>option.value === savedTime)){
    const [hourText,minute = "00"] = savedTime.split(":");
    const hour24 = Number(hourText);
    const hour12 = hour24 % 12 || 12;
    const period = hour24 < 12 ? "AM" : "PM";
    const labelSuffix = suffix ? ` (${suffix})` : "";
    incidentTime.add(new Option(`${hour12}:${minute} ${period}${labelSuffix}`,savedTime));
  }
  incidentTime.value = savedTime;
}

function displayTime(value){
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if(!match){
    return value || "Not provided";
  }
  const hour24 = Number(match[1]);
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${match[2]} ${hour24 < 12 ? "AM" : "PM"}`;
}

function reportValue(value){
  return escapeHtml(value || "Not provided");
}

function reportCell(label,value,className = ""){
  return `<div class="report-cell ${className}"><span class="report-label">${escapeHtml(label)}</span>${reportValue(value)}</div>`;
}

function guidanceSignatory(item){
  if(item?.guidanceLevel === "JHS"){
    return "Alexander S. Moreno";
  }
  return "Monalisa G. Lebuna";
}

function renderCaseReport(item){
  const primary = item.primaryStudent || {};
  const participants = [
    { student:primary, role:item.primaryRole || "Not provided", notes:"Main learner" },
    ...(item.involved || [])
  ];
  const participantRows = participants.map(entry=>`
    <tr>
      <td>${reportValue(entry.student?.name)}</td>
      <td>${reportValue(entry.student?.gradeSection)}</td>
      <td>${reportValue(entry.role)}</td>
      <td>${reportValue(entry.notes)}</td>
    </tr>`).join("");
  const adviserText = [...new Set((item.advisers || [])
    .map(adviser=>adviser.teacher)
    .filter(Boolean))]
    .join("; ") || "Adviser not assigned";

  caseReportSheet.classList.toggle("compact-report",participants.length <= 3);
  caseReportSheet.innerHTML = `
    <header class="report-school-header">
      <img src="/bakhaw-school-logo.png" alt="">
      <div>
        <h1>Bakhaw Integrated School</h1>
        <h2>Guidance Office</h2>
      </div>
    </header>
    <div class="report-title">
      <h2>Guidance Intake Sheet Report</h2>
      <p>FOR OFFICIAL SCHOOL USE ONLY</p>
    </div>
    <div class="report-meta">
      ${reportCell("Case Number",guidanceCaseNumberForDisplay(item))}
      ${reportCell("Report Date",reportDisplayDate(item.reportDate) || item.reportDate)}
      ${reportCell("Case Status",item.status)}
      ${reportCell("Guidance Level",item.guidanceLevel)}
    </div>

    <section class="report-section">
      <h3>I. Incident Information</h3>
      <div class="report-detail-grid">
        ${reportCell("Incident Date",reportDisplayDate(item.incidentDate) || item.incidentDate)}
        ${reportCell("Incident Time",displayTime(item.incidentTime))}
        ${reportCell("Incident Location",item.incidentLocation,"wide-2")}
        ${reportCell("Incident Type",item.aggressionType,"wide-2")}
        ${reportCell("Referred To",item.referredTo,"wide-2")}
      </div>
    </section>

    <section class="report-section">
      <h3>II. Main Learner Profile</h3>
      <div class="report-profile-grid">
        ${reportCell("Learner Name",primary.name,"wide-2")}
        ${reportCell("Involvement",item.primaryRole)}
        ${reportCell("Grade / Section",primary.gradeSection)}
        ${reportCell("Sex",primary.sex)}
        ${reportCell("Age",primary.age)}
        ${reportCell("Birthday",reportDisplayDate(primary.birthday) || primary.birthday)}
        ${reportCell("LRN",primary.lrn)}
        ${reportCell("Contact Number",primary.contactNumber)}
        ${reportCell("Address",primary.address,"wide-3")}
        ${reportCell("Father",primary.father)}
        ${reportCell("Mother",primary.mother)}
        ${reportCell("Guardian",primary.guardian)}
      </div>
    </section>

    <section class="report-section">
      <h3>III. Learners Involved</h3>
      <table class="report-table">
        <thead><tr><th>Learner Name</th><th>Grade / Section</th><th>Involvement</th><th>Notes</th></tr></thead>
        <tbody>${participantRows}</tbody>
      </table>
    </section>

    <section class="report-section">
      <h3>IV. Incident Narrative / Evidence</h3>
      <div class="report-narrative">${reportValue(item.aggressionDetails)}</div>
    </section>

    <section class="report-section">
      <h3>V. Immediate Response Taken</h3>
      <div class="report-narrative">${reportValue(item.immediateResponse)}</div>
    </section>

    <section class="report-section">
      <h3>VI. Action Recommended / Needed Interventions</h3>
      <div class="report-detail-grid">
        ${reportCell("Recommended Action",item.intervention,"wide-2")}
        ${reportCell("Referred To",item.referredTo,"wide-2")}
        ${reportCell("Details and Follow-up Plan",item.interventionDetails,"wide-4")}
      </div>
    </section>

    <section class="report-section">
      <h3>VII. Class Adviser Notification</h3>
      <div class="report-detail-grid">
        ${reportCell("Class Adviser(s)",adviserText,"wide-2")}
        ${reportCell("Informed",item.adviserInformed ? "Yes" : "No")}
        ${reportCell("Date Informed",item.adviserInformedAt ? reportDisplayDate(item.adviserInformedAt) : "Not provided")}
      </div>
    </section>

    <div class="report-signatures">
      <div>
        <div class="report-signature-line">${reportValue(guidanceSignatory(item))}</div>
        <small>${reportValue(item.guidanceLevel)} Guidance Designate / Prepared by</small>
      </div>
      <div>
        <div class="report-signature-line">School Head / Principal</div>
        <small>Noted by</small>
      </div>
    </div>
    <footer class="report-footer">
      Confidential learner record. Handle and store in accordance with the Data Privacy Act of 2012.
      Generated from ${reportValue(guidanceCaseNumberForDisplay(item))}.
    </footer>`;
}

function openCaseReport(item){
  renderCaseReport(item);
  caseReportDialog.showModal();
}

function consolidatedLearners(){
  const learnerMap = new Map();
  cases.forEach(item=>{
    const appearances = [
      { student:item.primaryStudent, role:item.primaryRole },
      ...(item.involved || []).map(entry=>({ student:entry.student, role:entry.role }))
    ];
    appearances.forEach(entry=>{
      if(!entry.student){
        return;
      }
      const key = entry.student.id || `${entry.student.name}|${entry.student.gradeSection}`;
      if(!learnerMap.has(key)){
        learnerMap.set(key,{
          name:entry.student.name || "Not provided",
          gradeSection:entry.student.gradeSection || "Not provided",
          appearances:[]
        });
      }
      learnerMap.get(key).appearances.push({
        role:entry.role || "Not provided",
        incidentDate:item.incidentDate,
        status:item.status || "Not provided",
        caseNumber:guidanceCaseNumberForDisplay(item)
      });
    });
  });
  return [...learnerMap.values()].sort((a,b)=>a.name.localeCompare(b.name));
}

function detailLines(appearances,key,formatter = value=>value){
  return appearances.map(entry=>`<div>${reportValue(formatter(entry[key]))}</div>`).join("");
}

function renderConsolidation(){
  const query = consolidationSearch.value.trim().toLowerCase();
  const allLearners = consolidatedLearners();
  const visible = allLearners.filter(item=>
    `${item.name} ${item.gradeSection}`.toLowerCase().includes(query)
  );
  const totalAppearances = allLearners.reduce((sum,item)=>sum + item.appearances.length,0);
  consolidationSummary.textContent = `${allLearners.length} learner${allLearners.length === 1 ? "" : "s"} | ${totalAppearances} total appearance${totalAppearances === 1 ? "" : "s"}`;
  consolidationBody.innerHTML = visible.length ? visible.map(item=>`
    <tr>
      <td><strong>${reportValue(item.name)}</strong></td>
      <td>${reportValue(item.gradeSection)}</td>
      <td class="count-cell">${item.appearances.length}</td>
      <td class="detail-cell">${detailLines(item.appearances,"role")}</td>
      <td class="detail-cell">${detailLines(item.appearances,"incidentDate",value=>reportDisplayDate(value) || value)}</td>
      <td class="detail-cell">${detailLines(item.appearances,"status")}</td>
      <td class="detail-cell">${detailLines(item.appearances,"caseNumber")}</td>
    </tr>`).join("") : `<tr><td class="consolidation-empty" colspan="7">No learners found in saved cases.</td></tr>`;
}

function openConsolidation(){
  consolidationSearch.value = "";
  renderConsolidation();
  consolidationDialog.showModal();
}

function bindDatePicker(textInputId, pickerId){
  const textInput = document.getElementById(textInputId);
  const picker = document.getElementById(pickerId);
  const button = document.querySelector(`[data-date-picker="${pickerId}"]`);

  button.addEventListener("click",()=>{
    if(button.disabled){
      return;
    }
    try{
      picker.value = isoDate(textInput.value,textInput.previousElementSibling?.textContent || "Date",false);
    }catch{
      picker.value = "";
    }
    if(typeof picker.showPicker === "function"){
      picker.showPicker();
    }else{
      picker.click();
    }
  });

  picker.addEventListener("change",()=>{
    if(picker.value){
      textInput.value = displayDate(picker.value);
    }
  });
}

function escapeHtml(value){
  return String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function studentName(student){
  const given = [student.firstName,student.middleName,student.extension].filter(Boolean).join(" ");
  return [student.familyName,given].filter(Boolean).join(", ");
}

function orderedStudents(){
  return [...students].sort((a,b)=>
    String(a.gradeSection).localeCompare(String(b.gradeSection),undefined,{numeric:true})
    || String(a.familyName).localeCompare(String(b.familyName))
    || String(a.firstName).localeCompare(String(b.firstName))
  );
}

function refreshStudentOptions(){
  studentOptions.innerHTML = orderedStudents().map(student=>
    `<option value="${escapeHtml(studentName(student))}">${escapeHtml(student.gradeSection || "")}</option>`
  ).join("");
}

function selectedStudentFromInput(input){
  const value = String(input?.value || "").trim();
  if(!value){
    return null;
  }
  return students.find(student=>student.id === value)
    || students.find(student=>studentName(student).toLowerCase() === value.toLowerCase())
    || students.find(student=>studentName(student).toLowerCase().includes(value.toLowerCase()));
}

function learnerMatches(query){
  const cleanQuery = String(query || "").trim().toLowerCase();
  return orderedStudents()
    .filter(student=>{
      const name = studentName(student).toLowerCase();
      const section = String(student.gradeSection || "").toLowerCase();
      return !cleanQuery || name.includes(cleanQuery) || section.includes(cleanQuery);
    })
    .slice(0,8);
}

function attachLearnerDropdown(input, menu){
  if(!input || !menu){
    return;
  }

  const close = ()=>{
    menu.hidden = true;
    menu.innerHTML = "";
  };

  const open = ()=>{
    const matches = learnerMatches(input.value);
    menu.innerHTML = matches.length ? matches.map(student=>`
      <button class="learner-suggestion" type="button" data-student-id="${escapeHtml(student.id)}">
        ${escapeHtml(studentName(student))}
        <span>${escapeHtml(student.gradeSection || "No section")}</span>
      </button>
    `).join("") : `<div class="profile-card empty">No matching learner.</div>`;
    menu.hidden = false;
  };

  input.addEventListener("input", ()=>{
    open();
    updateAutomaticDetails();
  });
  input.addEventListener("focus", open);
  input.addEventListener("keydown", event=>{
    if(event.key === "Escape"){
      close();
    }
  });
  input.addEventListener("blur", ()=>{
    window.setTimeout(close, 150);
  });
  menu.addEventListener("mousedown", event=>{
    const button = event.target.closest(".learner-suggestion");
    if(!button){
      return;
    }
    event.preventDefault();
    const student = students.find(item=>item.id === button.dataset.studentId);
    if(student){
      input.value = studentName(student);
      close();
      input.dispatchEvent(new Event("change",{bubbles:true}));
      input.focus();
    }
  });
}

function studentInputValue(studentId, fallbackName = ""){
  const student = students.find(item=>item.id === studentId);
  return student ? studentName(student) : String(fallbackName || "").trim();
}

function studentIdFromInput(input){
  return selectedStudentFromInput(input)?.id || "";
}

function selectedStudents(){
  return [
    selectedStudentFromInput(primaryStudent),
    ...[...involvedList.querySelectorAll(".involved-student")].map(selectedStudentFromInput)
  ].filter(Boolean);
}

function isJhs(student){
  const grade = Number(String(student?.gradeSection || "").match(/^\d+/)?.[0]);
  return grade >= 7 && grade <= 10;
}

function renderPrimaryProfile(){
  const student = selectedStudentFromInput(primaryStudent);
  if(!student){
    primaryProfile.className = "profile-card empty";
    primaryProfile.textContent = "Select a learner to reveal the complete profile.";
  }else{
    primaryProfile.className = "profile-card";
    primaryProfile.innerHTML = profileFields.map(([label,key])=>`
      <div class="profile-item"><span>${label}</span><strong>${escapeHtml(student[key] || "Not provided")}</strong></div>
    `).join("");
  }
  updateAutomaticDetails();
}

function addInvolvedRow(data = {}){
  const selectedValue = studentInputValue(data.studentId || data.student?.id || "", data.student?.name || "");
  const row = document.createElement("div");
  row.className = "involved-row";
  row.innerHTML = `
    <label class="learner-picker"><span>Learner</span><input class="involved-student" value="${escapeHtml(selectedValue)}" placeholder="Type learner name" autocomplete="off"><div class="learner-suggestions" hidden></div></label>
    <label><span>Role</span><select class="involved-role">${roles.map(role=>`<option ${role === data.role ? "selected" : ""}>${role}</option>`).join("")}</select></label>
    <label><span>Notes</span><input class="involved-notes" value="${escapeHtml(data.notes || "")}" placeholder="Participation or observation"></label>
    <button class="remove-involved" type="button">Remove</button>`;
  row.querySelector(".remove-involved").addEventListener("click", ()=>{
    row.remove();
    updateAutomaticDetails();
  });
  const involvedInput = row.querySelector(".involved-student");
  attachLearnerDropdown(involvedInput,row.querySelector(".learner-suggestions"));
  involvedInput.addEventListener("change", updateAutomaticDetails);
  involvedList.appendChild(row);
}

function updateAutomaticDetails(){
  const selected = selectedStudents();
  const sections = [...new Set(selected.map(student=>student.gradeSection))];
  const adviserLines = sections.map(section=>{
    const advisory = advisories.find(item=>item.gradeSection === section);
    return `${section}: ${advisory?.teacher || "Adviser not assigned"}`;
  });
  adviserSummary.textContent = adviserLines.length ? adviserLines.join(" | ") : "Select learners to identify their class adviser(s).";
  const hasJhs = selected.some(isJhs);
  signatoryPreview.textContent = hasJhs ? "Alexander S. Moreno" : "Monalisa G. Lebuna";
  signatoryReason.textContent = "";
}

function casePayload(){
  return {
    reportDate:isoDate(document.getElementById("reportDate").value,"Report Date"),
    incidentDate:isoDate(document.getElementById("incidentDate").value,"Incident Date"),
    incidentTime:incidentTime.value,
    incidentLocation:document.getElementById("incidentLocation").value,
    primaryStudentId:studentIdFromInput(primaryStudent),
    primaryRole:document.getElementById("primaryRole").value,
    involved:[...involvedList.querySelectorAll(".involved-row")].map(row=>({
      studentId:studentIdFromInput(row.querySelector(".involved-student")),
      role:row.querySelector(".involved-role").value,
      notes:row.querySelector(".involved-notes").value.trim()
    })).filter(item=>item.studentId),
    aggressionType:document.getElementById("aggressionType").value,
    aggressionDetails:document.getElementById("aggressionDetails").value.trim(),
    immediateResponse:document.getElementById("immediateResponse").value,
    referredTo:document.getElementById("referredTo").value,
    intervention:document.getElementById("intervention").value,
    interventionDetails:document.getElementById("interventionDetails").value.trim(),
    adviserInformed:adviserInformed.checked,
    adviserInformedAt:isoDate(adviserInformedAt.value,"Date Informed",adviserInformed.checked),
    status:document.getElementById("caseStatus").value
  };
}

function guidanceApiPayload(item){
  return {
    caseNumber:item.caseNumber,
    reportDate:item.reportDate,
    incidentDate:item.incidentDate,
    incidentTime:item.incidentTime,
    incidentLocation:item.incidentLocation,
    primaryStudentId:item.primaryStudent?.id,
    primaryRole:item.primaryRole,
    involved:(item.involved || []).map(entry=>({
      studentId:entry.student?.id,
      role:entry.role,
      notes:entry.notes
    })),
    aggressionType:item.aggressionType,
    aggressionDetails:item.aggressionDetails,
    immediateResponse:item.immediateResponse,
    referredTo:item.referredTo,
    intervention:item.intervention,
    interventionDetails:item.interventionDetails,
    adviserInformed:item.adviserInformed === true,
    adviserInformedAt:item.adviserInformedAt,
    status:item.status
  };
}

function guidanceStudentSnapshot(student){
  return {
    id:student.id,
    name:studentName(student),
    gradeSection:student.gradeSection,
    sex:student.sex,
    age:student.age,
    birthday:student.birthday,
    lrn:student.lrn,
    address:student.address,
    father:student.father,
    mother:student.mother,
    guardian:student.guardian,
    contactNumber:student.contactNumber
  };
}

function isPendingCaseNumber(value){
  return !String(value || "").trim() || String(value || "").trim().toLowerCase() === "pending sync";
}

function localGuidanceCaseNumber(item = {}){
  const year = String(item.reportDate || item.incidentDate || item.createdAt || localIsoDate()).match(/\d{4}/)?.[0] || String(new Date().getFullYear());
  const seed = String(item.id || item.createdAt || item.updatedAt || item.primaryStudent?.name || `${Date.now()}`);
  let hash = 0;
  for(const character of seed){
    hash = (hash * 31 + character.charCodeAt(0)) % 9000;
  }
  return `GDC-${year}-${String(hash + 1000).padStart(4, "0")}`;
}

function guidanceCaseNumberForDisplay(item = {}){
  if(isPendingGuidanceCase(item)){
    return item.localCaseNumber || (isPendingCaseNumber(item.caseNumber) ? localGuidanceCaseNumber(item) : item.caseNumber);
  }
  return item.caseNumber || "Not provided";
}

function guidanceCaseFromPayload(payload, existingCase = null){
  const primary = students.find(student=>student.id === String(payload.primaryStudentId || ""));
  if(!primary){
    throw new Error("Select the learner whose case profile will be opened.");
  }

  if(!payload.incidentDate || !payload.incidentLocation || !payload.aggressionType || !payload.immediateResponse || !payload.referredTo || !payload.intervention){
    throw new Error("Complete the incident location, response, referral, and recommended intervention.");
  }

  const seen = new Set();
  const involved = (payload.involved || [])
    .map(item=>({
      student:students.find(student=>student.id === String(item.studentId || "")),
      role:String(item.role || "").trim(),
      notes:String(item.notes || "").trim()
    }))
    .filter(item=>item.student && item.student.id !== primary.id)
    .filter(item=>{
      if(seen.has(item.student.id)){
        return false;
      }
      seen.add(item.student.id);
      return true;
    });

  const participants = [primary, ...involved.map(item=>item.student)];
  const hasJhsLearner = participants.some(isJhs);
  const advisers = [...new Map(participants.map(student=>{
    const advisory = advisories.find(item=>item.gradeSection === student.gradeSection);
    return [student.gradeSection, {
      gradeSection:student.gradeSection,
      teacher:advisory?.teacher || "Adviser not assigned",
      department:advisory?.department || (isJhs(student) ? "JHS" : "Elementary")
    }];
  })).values()];
  const now = new Date().toISOString();
  const id = existingCase?.id || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const localCaseNumber = existingCase?.localCaseNumber || localGuidanceCaseNumber({
    id,
    reportDate:payload.reportDate,
    incidentDate:payload.incidentDate,
    createdAt:existingCase?.createdAt || now,
    primaryStudent:guidanceStudentSnapshot(primary)
  });

  return {
    id,
    caseNumber:existingCase?.caseNumber && !isPendingCaseNumber(existingCase.caseNumber) ? existingCase.caseNumber : localCaseNumber,
    localCaseNumber,
    reportDate:payload.reportDate,
    incidentDate:payload.incidentDate,
    incidentTime:String(payload.incidentTime || "").trim(),
    incidentLocation:String(payload.incidentLocation || "").trim(),
    primaryStudent:guidanceStudentSnapshot(primary),
    primaryRole:String(payload.primaryRole || "Victim").trim(),
    involved:involved.map(item=>({
      student:guidanceStudentSnapshot(item.student),
      role:item.role || "Witness",
      notes:item.notes
    })),
    aggressionType:String(payload.aggressionType || "").trim(),
    aggressionDetails:String(payload.aggressionDetails || "").trim(),
    immediateResponse:String(payload.immediateResponse || "").trim(),
    referredTo:String(payload.referredTo || "").trim(),
    intervention:String(payload.intervention || "").trim(),
    interventionDetails:String(payload.interventionDetails || "").trim(),
    advisers,
    adviserInformed:payload.adviserInformed === true,
    adviserInformedAt:payload.adviserInformed === true ? String(payload.adviserInformedAt || payload.reportDate).trim() : "",
    status:["Open", "For Monitoring", "Resolved", "Referred"].includes(payload.status) ? payload.status : "Open",
    guidanceLevel:hasJhsLearner ? "JHS" : "Elementary",
    signatory:hasJhsLearner ? "Alexander S. Moreno" : "Monalisa G. Lebuna",
    createdBy:existingCase?.createdBy || "",
    createdAt:existingCase?.createdAt || now,
    updatedAt:now,
    pendingSync:true
  };
}

function guidanceCaseSyncPayload(guidanceCase){
  return {
    caseNumber:isPendingGuidanceCase(guidanceCase) ? "" : guidanceCase.caseNumber,
    reportDate:guidanceCase.reportDate,
    incidentDate:guidanceCase.incidentDate,
    incidentTime:guidanceCase.incidentTime,
    incidentLocation:guidanceCase.incidentLocation,
    primaryStudentId:guidanceCase.primaryStudent?.id || "",
    primaryRole:guidanceCase.primaryRole || "Victim",
    involved:(Array.isArray(guidanceCase.involved) ? guidanceCase.involved : []).map(item=>({
      studentId:item.student?.id || "",
      role:item.role || "Witness",
      notes:item.notes || ""
    })),
    aggressionType:guidanceCase.aggressionType,
    aggressionDetails:guidanceCase.aggressionDetails,
    immediateResponse:guidanceCase.immediateResponse,
    referredTo:guidanceCase.referredTo,
    intervention:guidanceCase.intervention,
    interventionDetails:guidanceCase.interventionDetails,
    status:guidanceCase.status || "Open",
    adviserInformed:guidanceCase.adviserInformed === true,
    adviserInformedAt:guidanceCase.adviserInformedAt || guidanceCase.reportDate
  };
}

function isPendingGuidanceCase(item){
  return item?.pendingSync === true
    || isPendingCaseNumber(item?.caseNumber)
    || String(item?.id || "").startsWith("offline-");
}

async function purgeLegacyGuidanceLocalData(){
  localStorage.removeItem("bakhaw-guidance-case-backup");
  const localCases = await LearnerOffline.loadGuidanceCases?.().catch(()=>[]) || [];
  const pendingCases = localCases.filter(isPendingGuidanceCase);
  if(localCases.length !== pendingCases.length){
    await LearnerOffline.clearGuidanceLocalData?.().catch(()=>{});
    await Promise.all(pendingCases.map(item=>LearnerOffline.saveGuidanceCase?.(item).catch(()=>{})));
  }
  localStorage.setItem(guidanceLegacyPurgeKey, "yes");
}

async function saveGuidanceCaseOnline(payload, existingCase = null){
  const editingServerCase = existingCase?.id && !String(existingCase.id).startsWith("offline-");
  const endpoint = editingServerCase
    ? `/api/guidance-cases/${encodeURIComponent(existingCase.id)}`
    : "/api/guidance-cases";
  const response = await guidanceFetch(endpoint, {
    method:editingServerCase ? "PUT" : "POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  }, 30000);
  const data = await response.json();
  if(isGuidanceAuthResponse(response)){
    const error = new Error("Guidance administrator login is required before this case can be saved online.");
    error.status = response.status;
    throw error;
  }
  if(!response.ok || !data.ok || !data.guidanceCase){
    const error = new Error(data.message || "Guidance case could not be saved online.");
    error.status = response.status;
    throw error;
  }
  return data.guidanceCase;
}

async function saveGuidanceCaseOnDevice(payload, existingCase = null){
  const guidanceCase = guidanceCaseFromPayload(payload, existingCase);
  if(!window.LearnerOffline?.saveGuidanceCase){
    throw new Error("Guidance case could not be saved on this device.");
  }
  await LearnerOffline.saveGuidanceCase(guidanceCase);
  renderCases();
  return guidanceCase;
}

async function syncPendingGuidanceCases(){
  if(!navigator.onLine || !window.LearnerOffline?.loadGuidanceCases){
    return false;
  }

  const localCases = await LearnerOffline.loadGuidanceCases().catch(()=>[]);
  const pendingCases = localCases.filter(isPendingGuidanceCase);
  let syncedAny = false;
  for(const pendingCase of pendingCases){
    const savedCase = await saveGuidanceCaseOnline(guidanceCaseSyncPayload(pendingCase), null);
    await LearnerOffline.removeGuidanceCase?.(pendingCase.id).catch(()=>{});
    syncedAny = Boolean(savedCase) || syncedAny;
  }
  return syncedAny;
}

async function retryPendingGuidanceSync(){
  if(guidancePendingSyncInFlight || !navigator.onLine){
    return false;
  }
  guidancePendingSyncInFlight = true;
  try{
    const localCases = await LearnerOffline.loadGuidanceCases?.().catch(()=>[]) || [];
    const pendingCases = localCases.filter(isPendingGuidanceCase);
    if(!pendingCases.length){
      return false;
    }

    const syncedAny = await syncPendingGuidanceCases();
    renderCases();
    if(syncedAny){
      await updateGuidanceSyncStatus("Pending Guidance case synced. Loading shared Guidance cases...");
      await loadData();
      return true;
    }
    return false;
  }catch(error){
    if(isConnectionFailure(error)){
      await updateGuidanceSyncStatus(guidanceStorageUnavailableMessage());
      queueGuidanceRetry(5000);
      return false;
    }
    await updateGuidanceSyncStatus(error.message || "Pending Guidance case could not sync.");
    return false;
  }finally{
    guidancePendingSyncInFlight = false;
  }
}

async function updateGuidanceSyncStatus(message = ""){
  caseStatusMessage.textContent = "";
}

function queueGuidanceDirectoryRefresh(delay = 600){
  if(!navigator.onLine || guidanceDirectoryRefreshInFlight || Date.now() - lastGuidanceDirectoryRefresh < 60000){
    return;
  }
  window.setTimeout(refreshGuidanceDirectoryOnline, delay);
}

async function refreshGuidanceDirectoryOnline(){
  if(!navigator.onLine || guidanceDirectoryRefreshInFlight || Date.now() - lastGuidanceDirectoryRefresh < 60000){
    return;
  }
  guidanceDirectoryRefreshInFlight = true;
  lastGuidanceDirectoryRefresh = Date.now();
  try{
    const [studentResponse,adviserResponse] = await Promise.all([
      guidanceFetch(guidanceApiUrl("/api/students"),{cache:"no-store"},10000),
      guidanceFetch(guidanceApiUrl("/api/advisory-directory"),{cache:"no-store"},10000)
    ]);
    const [studentData,adviserData] = await Promise.all([
      studentResponse.json(),
      adviserResponse.json()
    ]);
    if(studentResponse.ok && studentData.ok){
      const pendingLearnerChanges = await LearnerOffline.pendingCount();
      students = pendingLearnerChanges
        ? await LearnerOffline.loadRecords()
        : (studentData.students || []);
      if(!pendingLearnerChanges){
        await LearnerOffline.replaceRecords(students);
      }
    }
    if(adviserResponse.ok && adviserData.ok){
      advisories = adviserData.advisories || [];
      localStorage.setItem(advisoryCacheKey,JSON.stringify(advisories));
    }
    refreshStudentOptions();
    resetFormIfIdle();
    renderCases();
  }catch{
    refreshStudentOptions();
  }finally{
    guidanceDirectoryRefreshInFlight = false;
  }
}

function resetForm(){
  guidanceForm.reset();
  caseId.value = "";
  formTitle.textContent = "Guidance Case";
  caseNumberPreview.textContent = "Auto-generated when saved";
  document.getElementById("reportDate").value = displayDate(localIsoDate());
  document.getElementById("incidentDate").value = displayDate(localIsoDate());
  setIncidentTime(currentIncidentTime(), "");
  document.getElementById("incidentLocation").value = "Classroom";
  document.getElementById("aggressionType").value = "Physical Bullying";
  document.getElementById("caseStatus").value = "Open";
  document.getElementById("immediateResponse").value = "Informed Parent / Guardian";
  document.getElementById("referredTo").value = "Guidance Office";
  document.getElementById("intervention").value = "Counseling / Psychosocial Support";
  primaryProfile.className = "profile-card empty";
  primaryProfile.textContent = "Select a learner to reveal the complete profile.";
  involvedList.innerHTML = "";
  adviserInformedAt.disabled = true;
  adviserInformedPickerButton.disabled = true;
  formMessage.textContent = "";
  updateAutomaticDetails();
  guidanceFormDirty = false;
}

function resetFormIfIdle(){
  if(guidanceFormDirty || caseId.value || guidanceForm.contains(document.activeElement)){
    return false;
  }
  resetForm();
  return true;
}

function renderCases(){
  const query = caseSearch.value.trim().toLowerCase();
  const matchesQuery = item=>[
    guidanceCaseNumberForDisplay(item),item.primaryStudent?.name,item.primaryStudent?.gradeSection,
    item.aggressionType,item.status
  ].join(" ").toLowerCase().includes(query);
  const visibleCases = cases.filter(matchesQuery);
  caseStatusMessage.textContent = "";
  const cardHtml = item=>`
    <article class="case-card">
      <div class="case-card-head">
        <h3>${escapeHtml(guidanceCaseNumberForDisplay(item))}</h3>
        <span class="case-card-status">Status: ${escapeHtml(item.status || "Open")}</span>
      </div>
      <p class="case-learner-name"><strong>${escapeHtml(item.primaryStudent?.name)}</strong></p>
      <div class="case-card-actions">
        <button class="report" type="button" data-action="report" data-id="${escapeHtml(item.id)}">Report</button>
        <button type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
        <button class="danger" type="button" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </article>`;
  caseList.innerHTML = visibleCases.map(cardHtml).join("");
}

function mergeGuidanceCases(localCases = [], serverCases = []){
  const merged = new Map();
  [...serverCases, ...localCases].forEach(item=>{
    if(!item?.id){
      return;
    }
    const existing = merged.get(item.id);
    if(!existing || String(item.updatedAt || item.createdAt || "") > String(existing.updatedAt || existing.createdAt || "")){
      merged.set(item.id,item);
    }
  });
  const allCases = [...merged.values()];
  const realCaseLearners = new Set(allCases
    .filter(item=>!isPendingGuidanceCase(item))
    .map(item=>String(item.primaryStudent?.id || item.primaryStudent?.name || "").trim().toLowerCase())
    .filter(Boolean));
  return allCases
    .filter(item=>{
      if(!isPendingGuidanceCase(item)){
        return true;
      }
      const learnerKey = String(item.primaryStudent?.id || item.primaryStudent?.name || "").trim().toLowerCase();
      return !learnerKey || !realCaseLearners.has(learnerKey);
    })
    .sort((a,b)=>
    String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))
  );
}

function keepVisibleCases(nextCases = []){
  return Array.isArray(nextCases) ? nextCases : [];
}

async function refreshCasesFromDevice(){
  if(navigator.onLine){
    await loadData();
    return;
  }
  cases = [];
  renderCases();
  await updateGuidanceSyncStatus("");
}

function editCase(item){
  resetForm();
  caseId.value = item.id;
  formTitle.textContent = "Edit Guidance Case";
  caseNumberPreview.textContent = guidanceCaseNumberForDisplay(item);
  document.getElementById("reportDate").value = displayDate(item.reportDate);
  document.getElementById("incidentDate").value = displayDate(item.incidentDate);
  setIncidentTime(item.incidentTime);
  document.getElementById("incidentLocation").value = item.incidentLocation || "";
  primaryStudent.value = studentInputValue(item.primaryStudent?.id || "", item.primaryStudent?.name || "");
  document.getElementById("primaryRole").value = item.primaryRole || "Victim";
  item.involved?.forEach(addInvolvedRow);
  const legacyIncidentTypes = {
    "Psychological Bullying":"Psychological or Emotional Bullying"
  };
  document.getElementById("aggressionType").value = legacyIncidentTypes[item.aggressionType] || item.aggressionType;
  document.getElementById("aggressionDetails").value = item.aggressionDetails || "";
  document.getElementById("immediateResponse").value = item.immediateResponse || "";
  document.getElementById("referredTo").value = item.referredTo || "";
  document.getElementById("intervention").value = item.intervention;
  document.getElementById("interventionDetails").value = item.interventionDetails || "";
  document.getElementById("caseStatus").value = item.status;
  adviserInformed.checked = item.adviserInformed === true;
  adviserInformedAt.disabled = !adviserInformed.checked;
  adviserInformedPickerButton.disabled = !adviserInformed.checked;
  adviserInformedAt.value = displayDate(item.adviserInformedAt);
  renderPrimaryProfile();
  guidanceFormDirty = false;
  window.scrollTo({top:0,behavior:"smooth"});
}

async function loadData(){
  if(guidanceLoadInFlight){
    return;
  }
  guidanceLoadInFlight = true;
  lastGuidanceRefresh = Date.now();
  try{
  await purgeLegacyGuidanceLocalData();
  if(navigator.onLine){
    localStorage.removeItem("bakhaw-guidance-case-backup");
    caseStatusMessage.textContent = "";
  }else{
    cases = [];
    renderCases();
    caseStatusMessage.textContent = "";
  }

  try{
    students = await LearnerOffline.loadRecords();
  }catch{
    students = [];
  }
  try{
    advisories = JSON.parse(localStorage.getItem(advisoryCacheKey) || "[]");
  }catch{
    advisories = [];
  }
  refreshStudentOptions();
  resetFormIfIdle();
  renderCases();

  if(!navigator.onLine){
    return;
  }

  if(navigator.onLine){
    try{
      const syncedPendingCases = await syncPendingGuidanceCases();
      const caseResponse = await guidanceFetch(guidanceApiUrl("/api/guidance-cases"),{cache:"no-store"},20000);
      if(isGuidanceAuthResponse(caseResponse)){
        await keepGuidancePageOpen("Guidance session expired online. Saved cases remain available here.");
        return;
      }
      const caseData = await caseResponse.json();
      if(!caseResponse.ok || !caseData.ok){
        throw new Error(caseData.message || "Guidance records could not be loaded.");
      }
      let serverCases = caseData.cases || [];
      cases = mergeGuidanceCases([], serverCases);
      if(guidanceRetryTimer){
        window.clearTimeout(guidanceRetryTimer);
        guidanceRetryTimer = null;
      }
      renderCases();
      await updateGuidanceSyncStatus(`${cases.length} shared Guidance case${cases.length === 1 ? "" : "s"} loaded.${syncedPendingCases ? " Pending case synced." : ""}`);
      queueGuidanceDirectoryRefresh();
    }catch(error){
      cases = [];
      renderCases();
      if(!isConnectionFailure(error)){
        caseStatusMessage.textContent = "";
      }else{
        await updateGuidanceSyncStatus(guidanceStorageUnavailableMessage());
        queueGuidanceRetry(5000);
      }
    }
  }
  }finally{
    guidanceLoadInFlight = false;
  }
}

guidanceForm.addEventListener("submit",async event=>{
  event.preventDefault();
  saveCaseButton.disabled = true;
  saveCaseButton.textContent = "Saving...";
  const editing = Boolean(caseId.value);
  const existingCase = editing ? cases.find(item=>item.id === caseId.value) : null;
  try{
    const payload = casePayload();
    if(navigator.onLine){
      try{
        const savedCase = await saveGuidanceCaseOnline(payload,existingCase);
        resetForm();
        formMessage.textContent = `${savedCase.caseNumber} saved to shared Guidance storage.`;
        await loadData();
        return;
      }catch(error){
        if(!isConnectionFailure(error)){
          throw error;
        }
      }
    }
    const savedCase = await saveGuidanceCaseOnDevice(payload,existingCase);
    resetForm();
    formMessage.textContent = `${savedCase.caseNumber} saved on this device and will sync when shared storage is available.`;
    if(navigator.onLine){
      queueGuidanceRetry(1000);
    }
  }catch(error){
    formMessage.textContent = error.message || "Guidance case could not be saved.";
  }finally{
    saveCaseButton.disabled = false;
    saveCaseButton.textContent = caseId.value ? "Save Changes" : "Save Guidance Case";
  }
});

primaryStudent.addEventListener("input",renderPrimaryProfile);
primaryStudent.addEventListener("change",renderPrimaryProfile);
attachLearnerDropdown(primaryStudent,primaryStudentMenu);
document.getElementById("addInvolvedButton").addEventListener("click",()=>addInvolvedRow());
document.getElementById("clearCaseButton").addEventListener("click",resetForm);
adviserInformed.addEventListener("change",()=>{
  adviserInformedAt.disabled = !adviserInformed.checked;
  adviserInformedPickerButton.disabled = !adviserInformed.checked;
  adviserInformedAt.value = adviserInformed.checked ? (adviserInformedAt.value || displayDate(localIsoDate())) : "";
});
["reportDate","incidentDate","adviserInformedAt"].forEach(id=>{
  document.getElementById(id).addEventListener("input",event=>formatDateTyping(event.target));
});
bindDatePicker("reportDate","reportDatePicker");
bindDatePicker("incidentDate","incidentDatePicker");
bindDatePicker("adviserInformedAt","adviserInformedAtPicker");
populateIncidentTimes();
resetForm();
caseSearch.addEventListener("input",renderCases);
document.getElementById("closeCaseReport").addEventListener("click",()=>caseReportDialog.close());
document.getElementById("printCaseReport").addEventListener("click",()=>{
  document.body.classList.add("report-printing");
  window.print();
});
window.addEventListener("afterprint",()=>document.body.classList.remove("report-printing"));
caseReportDialog.addEventListener("close",()=>document.body.classList.remove("report-printing"));
document.getElementById("openConsolidation").addEventListener("click",openConsolidation);
document.getElementById("closeConsolidation").addEventListener("click",()=>consolidationDialog.close());
consolidationSearch.addEventListener("input",renderConsolidation);
document.getElementById("printConsolidation").addEventListener("click",()=>{
  document.body.classList.add("consolidation-printing");
  window.print();
});
window.addEventListener("afterprint",()=>document.body.classList.remove("consolidation-printing"));
consolidationDialog.addEventListener("close",()=>document.body.classList.remove("consolidation-printing"));
caseList.addEventListener("click",async event=>{
  const button = event.target.closest("[data-action]");
  if(!button) return;
  const item = cases.find(entry=>entry.id === button.dataset.id);
  if(!item) return;
  if(button.dataset.action === "report"){
    openCaseReport(item);
  }else if(button.dataset.action === "edit"){
    editCase(item);
  }else if(button.dataset.action === "delete" && confirm(`Delete ${guidanceCaseNumberForDisplay(item)}? This cannot be undone.`)){
    if(!navigator.onLine){
      caseStatusMessage.textContent = "";
      return;
    }
    try{
      const response = await guidanceFetch(`/api/guidance-cases/${encodeURIComponent(item.id)}`,{method:"DELETE"});
      const data = await response.json();
      if(!response.ok || !data.ok){
        throw new Error(data.message || "Case could not be deleted.");
      }
      cases = cases.filter(entry=>entry.id !== item.id);
      renderCases();
      await loadData();
    }catch(error){
      caseStatusMessage.textContent = "";
    }
  }
});

window.addEventListener("online",async ()=>{
  await updateGuidanceSyncStatus("Connection restored. Syncing pending cases and loading shared Guidance cases...");
  try{
    await retryPendingGuidanceSync();
    await loadData();
  }catch(error){
    caseStatusMessage.textContent = "";
  }
});
window.addEventListener("offline",()=>updateGuidanceSyncStatus("Offline mode: new cases stay pending on this device."));
window.addEventListener("pageshow",()=>{
  if(Date.now() - lastGuidanceRefresh > 5000){
    loadData();
  }
});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState === "visible" && Date.now() - lastGuidanceRefresh > 5000){
    loadData();
  }
});
LearnerOffline.onDataUpdated?.(async update=>{
  if(guidanceLoadInFlight){
    return;
  }
  if(update?.type === "learners"){
    students = await LearnerOffline.loadRecords();
    refreshStudentOptions();
  }else if(update?.type === "guidance"){
    await refreshCasesFromDevice();
  }
});
guidanceForm.addEventListener("input",()=>{ guidanceFormDirty = true; });
guidanceForm.addEventListener("change",()=>{ guidanceFormDirty = true; });
window.setInterval(()=>{
  if(navigator.onLine){
    retryPendingGuidanceSync();
  }
  if(document.visibilityState === "visible" && Date.now() - lastGuidanceRefresh > 5000){
    loadData();
  }
},5000);

function registerGuidanceServiceWorkerLater(){
  window.setTimeout(()=>{
    LearnerOffline.registerServiceWorker({warmCurrentOnly:true}).catch(()=>{});
  },2500);
}

if(window.teacherEntryAllowed !== false){
  loadData();
  registerGuidanceServiceWorkerLater();
}
