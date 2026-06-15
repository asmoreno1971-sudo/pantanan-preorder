const guidanceForm = document.getElementById("guidanceForm");
const primaryStudent = document.getElementById("primaryStudent");
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
let guidanceSyncInFlight = false;
const advisoryCacheKey = "bakhaw-guidance-advisories";

async function guidanceFetch(url, options = {}, timeoutMs = 5000){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{...options,signal:controller.signal});
  }finally{
    window.clearTimeout(timeout);
  }
}

function isConnectionFailure(error){
  return !navigator.onLine || error instanceof TypeError || error?.name === "AbortError";
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

function setIncidentTime(value){
  const savedTime = String(value || "");
  if(savedTime && ![...incidentTime.options].some(option=>option.value === savedTime)){
    const [hourText,minute = "00"] = savedTime.split(":");
    const hour24 = Number(hourText);
    const hour12 = hour24 % 12 || 12;
    const period = hour24 < 12 ? "AM" : "PM";
    incidentTime.add(new Option(`${hour12}:${minute} ${period} (saved)`,savedTime));
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
        <p class="republic">Republic of the Philippines</p>
        <p class="republic">Department of Education</p>
        <h1>Bakhaw Integrated School</h1>
        <h2>Guidance Office</h2>
      </div>
    </header>
    <div class="report-title">
      <h2>Guidance Intake Sheet Report</h2>
      <p>FOR OFFICIAL SCHOOL USE ONLY</p>
    </div>
    <div class="report-meta">
      ${reportCell("Case Number",item.caseNumber)}
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
      Generated from ${reportValue(item.caseNumber)}.
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
        caseNumber:item.caseNumber || "Not provided"
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

function studentOptions(selected = ""){
  const ordered = [...students].sort((a,b)=>
    String(a.gradeSection).localeCompare(String(b.gradeSection),undefined,{numeric:true})
    || String(a.familyName).localeCompare(String(b.familyName))
    || String(a.firstName).localeCompare(String(b.firstName))
  );
  return `<option value="">Select learner</option>${ordered.map(student=>
    `<option value="${escapeHtml(student.id)}" ${student.id === selected ? "selected" : ""}>${escapeHtml(studentName(student))}</option>`
  ).join("")}`;
}

function selectedStudents(){
  const ids = [primaryStudent.value, ...[...involvedList.querySelectorAll(".involved-student")].map(select=>select.value)].filter(Boolean);
  return ids.map(id=>students.find(student=>student.id === id)).filter(Boolean);
}

function isJhs(student){
  const grade = Number(String(student?.gradeSection || "").match(/^\d+/)?.[0]);
  return grade >= 7 && grade <= 10;
}

function renderPrimaryProfile(){
  const student = students.find(item=>item.id === primaryStudent.value);
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
  const row = document.createElement("div");
  row.className = "involved-row";
  row.innerHTML = `
    <label><span>Learner</span><select class="involved-student">${studentOptions(data.studentId || data.student?.id || "")}</select></label>
    <label><span>Role</span><select class="involved-role">${roles.map(role=>`<option ${role === data.role ? "selected" : ""}>${role}</option>`).join("")}</select></label>
    <label><span>Notes</span><input class="involved-notes" value="${escapeHtml(data.notes || "")}" placeholder="Participation or observation"></label>
    <button class="remove-involved" type="button">Remove</button>`;
  row.querySelector(".remove-involved").addEventListener("click", ()=>{
    row.remove();
    updateAutomaticDetails();
  });
  row.querySelector(".involved-student").addEventListener("change", updateAutomaticDetails);
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
  signatoryReason.textContent = hasJhs
    ? "JHS Guidance Designate selected because at least one involved learner is in Junior High School."
    : "Elementary Guidance Designate selected because all involved learners are Elementary / SPD.";
}

function casePayload(){
  return {
    reportDate:isoDate(document.getElementById("reportDate").value,"Report Date"),
    incidentDate:isoDate(document.getElementById("incidentDate").value,"Incident Date"),
    incidentTime:incidentTime.value,
    incidentLocation:document.getElementById("incidentLocation").value,
    primaryStudentId:primaryStudent.value,
    primaryRole:document.getElementById("primaryRole").value,
    involved:[...involvedList.querySelectorAll(".involved-row")].map(row=>({
      studentId:row.querySelector(".involved-student").value,
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

function guidanceStudentSnapshot(student){
  return {
    id:student.id,
    gradeSection:student.gradeSection,
    familyName:student.familyName,
    firstName:student.firstName,
    middleName:student.middleName,
    extension:student.extension,
    name:studentName(student),
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

function buildLocalGuidanceCase(payload, existingCase = null){
  const primary = students.find(student=>student.id === payload.primaryStudentId);
  if(!primary){
    throw new Error("Select the learner whose case profile will be opened.");
  }
  const seen = new Set();
  const involved = payload.involved.map(item=>({
    student:students.find(student=>student.id === item.studentId),
    role:item.role,
    notes:item.notes
  })).filter(item=>item.student && item.student.id !== primary.id).filter(item=>{
    if(seen.has(item.student.id)) return false;
    seen.add(item.student.id);
    return true;
  });
  const participants = [primary, ...involved.map(item=>item.student)];
  const sections = [...new Set(participants.map(student=>student.gradeSection))];
  const hasJhs = participants.some(isJhs);
  const now = new Date().toISOString();

  return {
    id:existingCase?.id || `offline-${LearnerOffline.uuid()}`,
    caseNumber:existingCase?.caseNumber || "Pending sync",
    reportDate:payload.reportDate,
    incidentDate:payload.incidentDate,
    incidentTime:payload.incidentTime,
    incidentLocation:payload.incidentLocation,
    primaryStudent:guidanceStudentSnapshot(primary),
    primaryRole:payload.primaryRole,
    involved:involved.map(item=>({
      student:guidanceStudentSnapshot(item.student),
      role:item.role || "Witness",
      notes:item.notes
    })),
    aggressionType:payload.aggressionType,
    aggressionDetails:payload.aggressionDetails,
    immediateResponse:payload.immediateResponse,
    referredTo:payload.referredTo,
    intervention:payload.intervention,
    interventionDetails:payload.interventionDetails,
    advisers:sections.map(section=>{
      const advisory = advisories.find(item=>item.gradeSection === section);
      return {
        gradeSection:section,
        teacher:advisory?.teacher || "Adviser not assigned",
        department:advisory?.department || (isJhs({gradeSection:section}) ? "JHS" : "Elementary")
      };
    }),
    adviserInformed:payload.adviserInformed,
    adviserInformedAt:payload.adviserInformed ? (payload.adviserInformedAt || payload.reportDate) : "",
    status:["Open","For Monitoring","Resolved","Referred"].includes(payload.status) ? payload.status : "Open",
    guidanceLevel:hasJhs ? "JHS" : "Elementary",
    signatory:hasJhs ? "Alexander S. Moreno" : "Monalisa G. Lebuna",
    createdBy:existingCase?.createdBy || "Alexander S. Moreno",
    createdAt:existingCase?.createdAt || now,
    updatedAt:now
  };
}

function guidanceApiPayload(item){
  return {
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

async function updateGuidanceSyncStatus(message = ""){
  const pending = await LearnerOffline.pendingGuidanceCount();
  const suffix = pending ? ` ${pending} change${pending === 1 ? "" : "s"} waiting to sync.` : "";
  if(message){
    caseStatusMessage.textContent = `${message}${suffix}`;
  }
}

async function syncPendingGuidanceChanges(){
  if(guidanceSyncInFlight || !navigator.onLine) return;
  guidanceSyncInFlight = true;
  try{
    const changes = await LearnerOffline.pendingGuidanceChanges();
    for(const change of changes){
      const endpoint = change.method === "POST"
        ? "/api/guidance-cases"
        : `/api/guidance-cases/${encodeURIComponent(change.id)}`;
      const options = {
        method:change.method,
        headers:{"Content-Type":"application/json"}
      };
      if(change.method !== "DELETE"){
        options.body = JSON.stringify(guidanceApiPayload(change.record));
      }
      const response = await guidanceFetch(endpoint,options);
      const data = await response.json();
      if(response.status === 401 || response.status === 403){
        window.location.replace(`/teacher-login?next=${encodeURIComponent("/guidance")}`);
        throw new Error("Guidance login is required before saved changes can sync.");
      }
      if(!response.ok && !(change.method === "DELETE" && response.status === 404)){
        throw new Error(data.message || "An offline guidance change could not be synchronized.");
      }
      if(change.method === "POST"){
        await LearnerOffline.removeGuidanceCase(change.id);
      }
      if(data.guidanceCase && change.method !== "DELETE"){
        await LearnerOffline.saveGuidanceCase(data.guidanceCase);
      }else if(change.method === "DELETE"){
        await LearnerOffline.removeGuidanceCase(change.id);
      }
      await LearnerOffline.removeGuidanceChange(change.changeId);
    }
  }finally{
    guidanceSyncInFlight = false;
  }
}

function resetForm(){
  guidanceForm.reset();
  caseId.value = "";
  formTitle.textContent = "Guidance Case";
  caseNumberPreview.textContent = "Auto-generated when saved";
  document.getElementById("reportDate").value = displayDate(localIsoDate());
  primaryProfile.className = "profile-card empty";
  primaryProfile.textContent = "Select a learner to reveal the complete profile.";
  involvedList.innerHTML = "";
  adviserInformedAt.disabled = true;
  adviserInformedPickerButton.disabled = true;
  formMessage.textContent = "";
  updateAutomaticDetails();
}

function renderCases(){
  const query = caseSearch.value.trim().toLowerCase();
  const visible = cases.filter(item=>[
    item.caseNumber,item.primaryStudent?.name,item.primaryStudent?.gradeSection,
    item.aggressionType,item.status
  ].join(" ").toLowerCase().includes(query));
  caseStatusMessage.textContent = `${visible.length} of ${cases.length} guidance case${cases.length === 1 ? "" : "s"}`;
  caseList.innerHTML = visible.length ? visible.map(item=>`
    <article class="case-card">
      <div class="case-card-head"><h3>${escapeHtml(item.caseNumber)}</h3><span class="case-badge">${escapeHtml(item.status)}</span></div>
      <p class="case-learner-name"><strong>${escapeHtml(item.primaryStudent?.name)}</strong></p>
      <div class="case-card-actions">
        <button class="report" type="button" data-action="report" data-id="${escapeHtml(item.id)}">Report</button>
        <button type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
        <button class="danger" type="button" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </article>`).join("") : `<div class="profile-card empty">No guidance cases match.</div>`;
}

function editCase(item){
  resetForm();
  caseId.value = item.id;
  formTitle.textContent = "Edit Guidance Case";
  caseNumberPreview.textContent = item.caseNumber;
  document.getElementById("reportDate").value = displayDate(item.reportDate);
  document.getElementById("incidentDate").value = displayDate(item.incidentDate);
  setIncidentTime(item.incidentTime);
  document.getElementById("incidentLocation").value = item.incidentLocation || "";
  primaryStudent.value = item.primaryStudent?.id || "";
  document.getElementById("primaryRole").value = item.primaryRole || "Victim";
  item.involved?.forEach(addInvolvedRow);
  document.getElementById("aggressionType").value = item.aggressionType;
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
  window.scrollTo({top:0,behavior:"smooth"});
}

async function loadData(){
  students = await LearnerOffline.loadRecords();
  cases = await LearnerOffline.loadGuidanceCases();
  try{
    advisories = JSON.parse(localStorage.getItem(advisoryCacheKey) || "[]");
  }catch{
    advisories = [];
  }
  primaryStudent.innerHTML = studentOptions();
  resetForm();
  renderCases();
  await updateGuidanceSyncStatus(cases.length
    ? (navigator.onLine ? "Saved guidance cases shown. Refreshing quietly." : "Offline mode: showing guidance cases saved on this device.")
    : (navigator.onLine ? "Loading guidance cases..." : "No offline guidance cases are saved on this device yet."));

  if(!navigator.onLine){
    return;
  }

  if(navigator.onLine){
    try{
      await syncPendingGuidanceChanges();
      const [studentResponse,caseResponse,adviserResponse] = await Promise.all([
        guidanceFetch("/api/students",{cache:"no-store"}),
        guidanceFetch("/api/guidance-cases",{cache:"no-store"}),
        guidanceFetch("/api/advisory-directory",{cache:"no-store"})
      ]);
      if(caseResponse.status === 401 || caseResponse.status === 403){
        window.location.replace(`/teacher-login?next=${encodeURIComponent("/guidance")}`);
        return;
      }
      const [studentData,caseData,adviserData] = await Promise.all([
        studentResponse.json(),caseResponse.json(),adviserResponse.json()
      ]);
      if(!studentResponse.ok || !caseResponse.ok){
        throw new Error("Guidance records could not be loaded.");
      }
      const pendingLearnerChanges = await LearnerOffline.pendingCount();
      students = pendingLearnerChanges
        ? await LearnerOffline.loadRecords()
        : (studentData.students || []);
      cases = caseData.cases || [];
      advisories = adviserData.advisories || [];
      if(!pendingLearnerChanges){
        await LearnerOffline.replaceRecords(students);
      }
      await LearnerOffline.replaceGuidanceCases(cases);
      localStorage.setItem(advisoryCacheKey,JSON.stringify(advisories));
      primaryStudent.innerHTML = studentOptions();
      resetForm();
      renderCases();
    }catch(error){
      if(!isConnectionFailure(error)){
        caseStatusMessage.textContent = error.message;
      }else{
        await updateGuidanceSyncStatus("Offline mode: saved Guidance data remains available.");
      }
    }
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
    const localCase = buildLocalGuidanceCase(payload,existingCase);
    if(existingCase?.id.startsWith("offline-")){
      await LearnerOffline.saveGuidanceCase(localCase);
      await LearnerOffline.queueGuidanceChange("PUT",localCase);
      cases[cases.findIndex(item=>item.id === localCase.id)] = localCase;
      resetForm();
      renderCases();
      formMessage.textContent = "Pending sync case updated locally.";
      await updateGuidanceSyncStatus("Guidance case updated locally.");
      return;
    }
    const response = await guidanceFetch(editing ? `/api/guidance-cases/${encodeURIComponent(caseId.value)}` : "/api/guidance-cases",{
      method:editing ? "PUT" : "POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload)
    });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Guidance case could not be saved.");
    }
    if(editing){
      cases[cases.findIndex(item=>item.id === data.guidanceCase.id)] = data.guidanceCase;
    }else{
      cases.unshift(data.guidanceCase);
    }
    await LearnerOffline.saveGuidanceCase(data.guidanceCase);
    resetForm();
    renderCases();
    formMessage.textContent = `${data.guidanceCase.caseNumber} saved.`;
  }catch(error){
    if(!isConnectionFailure(error)){
      formMessage.textContent = error.message;
    }else{
      try{
        const payload = casePayload();
        const localCase = buildLocalGuidanceCase(payload,existingCase);
        await LearnerOffline.saveGuidanceCase(localCase);
        await LearnerOffline.queueGuidanceChange(editing ? "PUT" : "POST",localCase);
        const index = cases.findIndex(item=>item.id === localCase.id);
        if(index >= 0){
          cases[index] = localCase;
        }else{
          cases.unshift(localCase);
        }
        resetForm();
        renderCases();
        formMessage.textContent = `${localCase.caseNumber} saved offline and will sync automatically.`;
        await updateGuidanceSyncStatus("Guidance case saved offline.");
      }catch(localError){
        formMessage.textContent = localError.message;
      }
    }
  }finally{
    saveCaseButton.disabled = false;
    saveCaseButton.textContent = caseId.value ? "Save Changes" : "Save Guidance Case";
  }
});

primaryStudent.addEventListener("change",renderPrimaryProfile);
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
  }else if(button.dataset.action === "delete" && confirm(`Delete ${item.caseNumber}? This cannot be undone.`)){
    if(item.id.startsWith("offline-")){
      await LearnerOffline.removeGuidanceCase(item.id);
      await LearnerOffline.queueGuidanceChange("DELETE",item);
      cases = cases.filter(entry=>entry.id !== item.id);
      renderCases();
      await updateGuidanceSyncStatus("Pending sync case deleted locally.");
      return;
    }
    try{
      const response = await guidanceFetch(`/api/guidance-cases/${encodeURIComponent(item.id)}`,{method:"DELETE"});
      const data = await response.json();
      if(!response.ok || !data.ok){
        throw new Error(data.message || "Case could not be deleted.");
      }
      await LearnerOffline.removeGuidanceCase(item.id);
      cases = cases.filter(entry=>entry.id !== item.id);
      renderCases();
    }catch(error){
      if(!isConnectionFailure(error)){
        caseStatusMessage.textContent = error.message;
      }else{
        await LearnerOffline.removeGuidanceCase(item.id);
        await LearnerOffline.queueGuidanceChange("DELETE",item);
        cases = cases.filter(entry=>entry.id !== item.id);
        renderCases();
        await updateGuidanceSyncStatus("Guidance case deleted offline.");
      }
    }
  }
});

window.addEventListener("online",async ()=>{
  await updateGuidanceSyncStatus("Connection restored. Syncing guidance cases...");
  try{
    await syncPendingGuidanceChanges();
    await loadData();
  }catch(error){
    caseStatusMessage.textContent = error.message;
  }
});
window.addEventListener("offline",()=>updateGuidanceSyncStatus("Offline mode: changes remain on this device."));

if(window.teacherEntryAllowed !== false){
  LearnerOffline.registerServiceWorker().catch(()=>{});
  loadData();
}
