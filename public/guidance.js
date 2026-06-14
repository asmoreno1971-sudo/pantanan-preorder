const guidanceForm = document.getElementById("guidanceForm");
const primaryStudent = document.getElementById("primaryStudent");
const primaryProfile = document.getElementById("primaryProfile");
const involvedList = document.getElementById("involvedList");
const adviserSummary = document.getElementById("adviserSummary");
const signatoryPreview = document.getElementById("signatoryPreview");
const signatoryReason = document.getElementById("signatoryReason");
const adviserInformed = document.getElementById("adviserInformed");
const adviserInformedAt = document.getElementById("adviserInformedAt");
const formMessage = document.getElementById("formMessage");
const saveCaseButton = document.getElementById("saveCaseButton");
const caseList = document.getElementById("caseList");
const caseSearch = document.getElementById("caseSearch");
const caseStatusMessage = document.getElementById("caseStatusMessage");
const caseId = document.getElementById("guidanceCaseId");
const caseNumberPreview = document.getElementById("caseNumberPreview");
const formTitle = document.getElementById("formTitle");

let students = [];
let cases = [];
let advisories = [];

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
    `<option value="${escapeHtml(student.id)}" ${student.id === selected ? "selected" : ""}>${escapeHtml(student.gradeSection)} - ${escapeHtml(studentName(student))}</option>`
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
  signatoryPreview.textContent = hasJhs ? "JHS Guidance Designate" : "Elementary Guidance Designate";
  signatoryReason.textContent = hasJhs
    ? "JHS signatory selected because at least one involved learner is in Junior High School."
    : "Elementary signatory selected because all involved learners are Elementary / SPD.";
}

function casePayload(){
  return {
    reportDate:document.getElementById("reportDate").value,
    incidentDate:document.getElementById("incidentDate").value,
    incidentTime:document.getElementById("incidentTime").value,
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
    adviserInformedAt:adviserInformedAt.value,
    status:document.getElementById("caseStatus").value
  };
}

function resetForm(){
  guidanceForm.reset();
  caseId.value = "";
  formTitle.textContent = "New Guidance Case";
  caseNumberPreview.textContent = "Auto-generated when saved";
  document.getElementById("reportDate").value = new Date().toISOString().slice(0,10);
  primaryProfile.className = "profile-card empty";
  primaryProfile.textContent = "Select a learner to reveal the complete profile.";
  involvedList.innerHTML = "";
  adviserInformedAt.disabled = true;
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
      <p><strong>${escapeHtml(item.primaryStudent?.name)}</strong><br>${escapeHtml(item.primaryStudent?.gradeSection)} - ${escapeHtml(item.primaryRole)}</p>
      <p>${escapeHtml(item.aggressionType)} | Incident: ${escapeHtml(item.incidentDate)}</p>
      <p>Signed by: ${escapeHtml(item.signatory)}</p>
      <div class="case-card-actions">
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
  document.getElementById("reportDate").value = item.reportDate;
  document.getElementById("incidentDate").value = item.incidentDate;
  document.getElementById("incidentTime").value = item.incidentTime || "";
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
  adviserInformedAt.value = item.adviserInformedAt || "";
  renderPrimaryProfile();
  window.scrollTo({top:0,behavior:"smooth"});
}

async function loadData(){
  try{
    const [studentResponse,caseResponse,adviserResponse] = await Promise.all([
      fetch("/api/students",{cache:"no-store"}),
      fetch("/api/guidance-cases",{cache:"no-store"}),
      fetch("/api/advisory-directory",{cache:"no-store"})
    ]);
    const [studentData,caseData,adviserData] = await Promise.all([
      studentResponse.json(),caseResponse.json(),adviserResponse.json()
    ]);
    if(!studentResponse.ok || !caseResponse.ok){
      throw new Error("Guidance records could not be loaded.");
    }
    students = studentData.students || [];
    cases = caseData.cases || [];
    advisories = adviserData.advisories || [];
    primaryStudent.innerHTML = studentOptions();
    resetForm();
    renderCases();
  }catch(error){
    caseStatusMessage.textContent = error.message;
  }
}

guidanceForm.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!navigator.onLine){
    formMessage.textContent = "Connect to the internet before saving a confidential guidance case.";
    return;
  }
  saveCaseButton.disabled = true;
  saveCaseButton.textContent = "Saving...";
  try{
    const editing = Boolean(caseId.value);
    const response = await fetch(editing ? `/api/guidance-cases/${encodeURIComponent(caseId.value)}` : "/api/guidance-cases",{
      method:editing ? "PUT" : "POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(casePayload())
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
    resetForm();
    renderCases();
    formMessage.textContent = `${data.guidanceCase.caseNumber} saved.`;
  }catch(error){
    formMessage.textContent = error.message;
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
  adviserInformedAt.value = adviserInformed.checked ? (adviserInformedAt.value || new Date().toISOString().slice(0,10)) : "";
});
caseSearch.addEventListener("input",renderCases);
caseList.addEventListener("click",async event=>{
  const button = event.target.closest("[data-action]");
  if(!button) return;
  const item = cases.find(entry=>entry.id === button.dataset.id);
  if(!item) return;
  if(button.dataset.action === "edit"){
    editCase(item);
  }else if(button.dataset.action === "delete" && confirm(`Delete ${item.caseNumber}? This cannot be undone.`)){
    const response = await fetch(`/api/guidance-cases/${encodeURIComponent(item.id)}`,{method:"DELETE"});
    const data = await response.json();
    if(response.ok && data.ok){
      cases = cases.filter(entry=>entry.id !== item.id);
      renderCases();
    }else{
      caseStatusMessage.textContent = data.message || "Case could not be deleted.";
    }
  }
});

if(window.teacherEntryAllowed !== false){
  loadData();
}
