const SHEET_FIELDS = [
  "gradeSection", "familyName", "firstName", "middleName", "extension",
  "sex", "age", "birthday", "statusCode", "dateOfMovement", "code3Class",
  "lrn", "address", "father", "mother", "guardian", "contactNumber"
];
const RECORD_DETAILS = [
  ["Grade / Section", "gradeSection"],
  ["Family Name", "familyName"],
  ["First Name", "firstName"],
  ["Middle Name", "middleName"],
  ["Extension", "extension"],
  ["Sex", "sex"],
  ["Age", "age"],
  ["Birthday", "birthday", true],
  ["Status Code", "statusCode"],
  ["Date of Movement", "dateOfMovement", true],
  ["If Code 3, which class?", "code3Class"],
  ["LRN", "lrn"],
  ["Address", "address"],
  ["Father", "father"],
  ["Mother", "mother"],
  ["Guardian", "guardian"],
  ["Contact Number", "contactNumber"]
];
const PAGE_SIZE = 25;
const TABLE_COLUMN_COUNT = 18;

const studentRows = document.getElementById("studentRows");
const studentSearch = document.getElementById("studentSearch");
const sectionFilter = document.getElementById("sectionFilter");
const recordsStatus = document.getElementById("recordsStatus");
const downloadClassButton = document.getElementById("downloadClassButton");
const liveDateTime = document.getElementById("liveDateTime");
const studentDialog = document.getElementById("studentDialog");
const studentForm = document.getElementById("studentForm");
const studentId = document.getElementById("studentId");
const dialogTitle = document.getElementById("dialogTitle");
const formStatus = document.getElementById("formStatus");
const saveStudentButton = document.getElementById("saveStudentButton");
const previousPageButton = document.getElementById("previousPageButton");
const nextPageButton = document.getElementById("nextPageButton");
const pageSummary = document.getElementById("pageSummary");
const gradeSectionInput = studentForm.elements.namedItem("gradeSection");
const statusCodeInput = studentForm.elements.namedItem("statusCode");
const code3ClassInput = studentForm.elements.namedItem("code3Class");

let students = [];
let spreadsheetSections = [];
let filteredStudents = [];
let currentPage = 1;
const expandedStudentIds = new Set();
let syncInFlight = false;
let sectionRefreshInFlight = false;
let reorderInFlight = false;

function savedGradeSections(){
  try{
    const saved = JSON.parse(localStorage.getItem("bakhawGradeSections") || "[]");
    return Array.isArray(saved) ? saved : [];
  }catch{
    return [];
  }
}

async function refreshSpreadsheetSections(rebuildDropdowns = false){
  if(sectionRefreshInFlight || !navigator.onLine){
    return;
  }

  sectionRefreshInFlight = true;
  try{
    const response = await fetch("/api/grade-sections", { cache:"no-store" });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Grade and section list could not be loaded.");
    }
    spreadsheetSections = Array.isArray(data.sections) ? data.sections : [];
    localStorage.setItem("bakhawGradeSections", JSON.stringify(spreadsheetSections));
    if(rebuildDropdowns){
      buildSectionFilter();
      buildRecordDropdowns();
      applySectionFromUrl();
      applyFilters();
    }
  }catch{
    if(!spreadsheetSections.length){
      spreadsheetSections = savedGradeSections();
    }
  }finally{
    sectionRefreshInFlight = false;
  }
}

async function loadStudents(){
  const cachedStudents = await LearnerOffline.loadRecords();
  students = cachedStudents;
  spreadsheetSections = savedGradeSections();
  if(students.length){
    buildSectionFilter();
    buildRecordDropdowns();
    applySectionFromUrl();
    applyFilters();
    await updateSyncStatus(navigator.onLine
      ? `${students.length.toLocaleString()} saved records shown. Refreshing quietly.`
      : "Offline mode: showing records saved on this device.");
  }else{
    recordsStatus.textContent = navigator.onLine ? "Loading records..." : "No offline learner records are saved on this device yet.";
  }

  if(!navigator.onLine){
    return;
  }

  try{
    await Promise.all([
      syncPendingChanges(),
      refreshSpreadsheetSections()
    ]);
    const studentResponse = await fetch("/api/students", { cache:"no-store" });
    const data = await studentResponse.json();

    if(!studentResponse.ok || !data.ok){
      throw new Error(data.message || "Unable to load records.");
    }

    students = Array.isArray(data.students) ? data.students : [];
    if(!spreadsheetSections.length){
      spreadsheetSections = savedGradeSections();
    }
    await LearnerOffline.replaceRecords(students);
    buildSectionFilter();
    buildRecordDropdowns();
    applySectionFromUrl();
    applyFilters();
    await updateSyncStatus();
  }catch(error){
    if(students.length){
      await updateSyncStatus("Saved records remain available while the server reconnects.");
    }else{
      const message = error.message;
      recordsStatus.textContent = message;
      studentRows.innerHTML = `<tr><td class="empty-state" colspan="${TABLE_COLUMN_COUNT}">${escapeHtml(message)}</td></tr>`;
    }
  }
}

async function updateSyncStatus(message = ""){
  const pending = await LearnerOffline.pendingCount();
  if(message){
    recordsStatus.textContent = pending ? `${message} ${pending} change${pending === 1 ? "" : "s"} waiting to sync.` : message;
  }else if(pending){
    recordsStatus.textContent = `${pending} change${pending === 1 ? "" : "s"} waiting to sync.`;
  }
}

async function syncPendingChanges(){
  if(syncInFlight || !navigator.onLine){
    return;
  }

  syncInFlight = true;
  try{
    const changes = await LearnerOffline.pendingChanges();
    for(const change of changes){
      const endpoint = change.method === "POST"
        ? "/api/students"
        : `/api/students/${encodeURIComponent(change.id)}`;
      const options = {
        method:change.method,
        headers:{ "Content-Type":"application/json" }
      };
      if(change.method !== "DELETE"){
        options.body = JSON.stringify(change.record);
      }

      const response = await fetch(endpoint, options);
      const data = await response.json();
      if(response.status === 401){
        window.location.replace(`/teacher-login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        throw new Error("Teacher login required before offline changes can sync.");
      }
      if(!response.ok && !(change.method === "DELETE" && response.status === 404)){
        throw new Error(data.message || "A saved offline change could not be synchronized.");
      }

      if(data.student && change.method !== "DELETE"){
        await LearnerOffline.saveRecord(data.student);
      }
      await LearnerOffline.removeChange(change.changeId);
    }
  }finally{
    syncInFlight = false;
  }
}

function applySectionFromUrl(){
  const requestedSection = new URLSearchParams(window.location.search).get("section");

  if(requestedSection && [...sectionFilter.options].some(option=>option.value === requestedSection)){
    sectionFilter.value = requestedSection;
  }
}

function studentSections(){
  return [...new Set([
    ...spreadsheetSections,
    ...students.map(student=>student.gradeSection)
  ].filter(Boolean))]
    .sort((a, b)=>a.localeCompare(b, undefined, { numeric:true }));
}

function buildSectionFilter(){
  const selected = sectionFilter.value;
  const sections = studentSections();

  sectionFilter.innerHTML = `<option value="">All sections</option>${sections
    .map(section=>`<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`)
    .join("")}`;

  if(sections.includes(selected)){
    sectionFilter.value = selected;
  }

}

function updateLiveDateTime(){
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

  liveDateTime.textContent = `${month} ${day}, ${year} ${time}`;
}

function buildRecordDropdowns(){
  const selectedGradeSection = gradeSectionInput.value;
  const selectedCode3Class = code3ClassInput.value;
  const sections = studentSections();
  const options = sections
    .map(section=>`<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`)
    .join("");

  gradeSectionInput.innerHTML = `<option value="">Select grade / section</option>${options}`;
  code3ClassInput.innerHTML = `<option value="">Select class</option>${options}`;
  setSelectValue(gradeSectionInput, selectedGradeSection);
  setSelectValue(code3ClassInput, selectedCode3Class);
}

function setSelectValue(select, value){
  const cleanValue = String(value || "");

  if(cleanValue && ![...select.options].some(option=>option.value === cleanValue)){
    const option = document.createElement("option");
    option.value = cleanValue;
    option.textContent = cleanValue;
    select.appendChild(option);
  }

  select.value = cleanValue;
}

function updateCode3ClassState(){
  const isCode3 = statusCodeInput.value === "3";
  code3ClassInput.disabled = !isCode3;
  code3ClassInput.required = isCode3;

  if(!isCode3){
    code3ClassInput.value = "";
  }
}

function applyFilters(){
  const query = normalizeSearchText(studentSearch.value);
  const queryTokens = query.split(" ").filter(Boolean);
  const section = sectionFilter.value;
  downloadClassButton.disabled = !section;

  filteredStudents = students.filter(student=>{
    if(section && student.gradeSection !== section){
      return false;
    }

    if(!queryTokens.length){
      return true;
    }

    const searchableRecord = normalizeSearchText([
      formatStudentName(student),
      student.firstName,
      student.middleName,
      student.familyName,
      student.extension,
      ...SHEET_FIELDS.map(field=>student[field])
    ].join(" "));

    return queryTokens.every(token=>searchableRecord.includes(token));
  });

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const maleCount = filteredStudents.filter(student=>String(student.sex || "").toUpperCase() === "MALE").length;
  const femaleCount = filteredStudents.filter(student=>String(student.sex || "").toUpperCase() === "FEMALE").length;
  recordsStatus.innerHTML = [
    `<span><strong>${filteredStudents.length.toLocaleString()}</strong> Learners</span>`,
    `<span><strong>${maleCount.toLocaleString()}</strong> Males</span>`,
    `<span><strong>${femaleCount.toLocaleString()}</strong> Females</span>`
  ].join("");
  renderStudents();
}

function csvCell(value){
  let text = String(value || "");
  if(/^[=+\-@]/.test(text)){
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadSelectedClass(){
  const section = sectionFilter.value;
  if(!section){
    recordsStatus.textContent = "Select a Grade / Section before downloading.";
    sectionFilter.focus();
    return;
  }

  const classStudents = students
    .filter(student=>student.gradeSection === section);
  if(!classStudents.length){
    recordsStatus.textContent = `No learners are recorded in ${section}.`;
    return;
  }

  const rows = [
    RECORD_DETAILS.map(([label])=>label),
    ...classStudents.map(student=>RECORD_DETAILS.map(([, field])=>student[field] || ""))
  ];
  const csv = `\uFEFF${rows.map(row=>row.map(csvCell).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileSection = section.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  link.href = url;
  link.download = `${fileSection || "class"}-learners.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  recordsStatus.textContent = `${classStudents.length} learners downloaded for ${section}.`;
}

function renderStudents(){
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageStudents = filteredStudents.slice(start, start + PAGE_SIZE);

  if(!pageStudents.length){
    studentRows.innerHTML = `<tr><td class="empty-state" colspan="${TABLE_COLUMN_COUNT}">No learner profiles match the current filters.</td></tr>`;
  }else{
    const hasSearch = Boolean(studentSearch.value.trim());
    const canReorder = !hasSearch && navigator.onLine && !reorderInFlight;
    studentRows.innerHTML = pageStudents.map(student=>{
      const isExpanded = hasSearch || expandedStudentIds.has(student.id);
      const classStudents = students.filter(item=>item.gradeSection === student.gradeSection);
      const classIndex = classStudents.findIndex(item=>item.id === student.id);
      const viewButton = hasSearch
        ? `<button class="row-button view" type="button" disabled>Full Record</button>`
        : `<button class="row-button view" type="button" data-action="view" data-id="${escapeHtml(student.id)}">${isExpanded ? "Hide" : "View"}</button>`;
      const moveButtons = `
        <button class="row-button move" type="button" data-action="move-up" data-id="${escapeHtml(student.id)}"
          ${canReorder && classIndex > 0 ? "" : "disabled"} aria-label="Move ${escapeHtml(formatStudentName(student))} up">Up</button>
        <button class="row-button move" type="button" data-action="move-down" data-id="${escapeHtml(student.id)}"
          ${canReorder && classIndex < classStudents.length - 1 ? "" : "disabled"} aria-label="Move ${escapeHtml(formatStudentName(student))} down">Down</button>`;

      return `
      <tr class="${isExpanded ? "record-row record-row-open" : "record-row"}">
        <td>${escapeHtml(student.gradeSection)}</td>
        <td class="learner-name">${escapeHtml(student.familyName)}</td>
        <td>${escapeHtml(student.firstName)}</td>
        <td>${escapeHtml(student.middleName)}</td>
        <td>${escapeHtml(student.extension)}</td>
        <td>${escapeHtml(student.sex)}</td>
        <td>${escapeHtml(student.age)}</td>
        <td>${escapeHtml(formatDate(student.birthday))}</td>
        <td>${escapeHtml(student.statusCode)}</td>
        <td>${escapeHtml(formatDate(student.dateOfMovement))}</td>
        <td>${escapeHtml(student.code3Class)}</td>
        <td>${escapeHtml(student.lrn)}</td>
        <td class="address-cell" title="${escapeHtml(student.address)}">${escapeHtml(student.address)}</td>
        <td>${escapeHtml(student.father)}</td>
        <td>${escapeHtml(student.mother)}</td>
        <td>${escapeHtml(student.guardian)}</td>
        <td>${escapeHtml(student.contactNumber)}</td>
        <td>
          <div class="row-actions">
            ${moveButtons}
            ${viewButton}
            <button class="row-button" type="button" data-action="edit" data-id="${escapeHtml(student.id)}">Edit</button>
            <button class="row-button delete" type="button" data-action="delete" data-id="${escapeHtml(student.id)}">Delete</button>
          </div>
        </td>
      </tr>
      ${isExpanded ? renderFullRecord(student) : ""}
    `;
    }).join("");
  }

  pageSummary.textContent = `Page ${currentPage} of ${totalPages}`;
  previousPageButton.disabled = currentPage <= 1;
  nextPageButton.disabled = currentPage >= totalPages;
}

async function moveStudent(student, direction){
  if(reorderInFlight || studentSearch.value.trim() || !navigator.onLine){
    return;
  }

  reorderInFlight = true;
  recordsStatus.textContent = `Moving ${formatStudentName(student)} ${direction}...`;
  renderStudents();

  try{
    const response = await fetch("/api/students/reorder", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ id:student.id, direction })
    });
    const data = await response.json();

    if(!response.ok || !data.ok){
      throw new Error(data.message || "Unable to reorder this learner.");
    }

    students = Array.isArray(data.students) ? data.students : students;
    await LearnerOffline.replaceRecords(students);
    applyFilters();
    recordsStatus.textContent = `${formatStudentName(student)} moved ${direction}.`;
    window.setTimeout(()=>applyFilters(), 1800);
  }catch(error){
    recordsStatus.textContent = error.message;
  }finally{
    reorderInFlight = false;
    renderStudents();
  }
}

function renderFullRecord(student){
  const details = RECORD_DETAILS.map(([label, field, isDate])=>{
    const rawValue = student[field] || "";
    const value = isDate ? formatDate(rawValue) : rawValue;

    return `
      <div class="record-detail">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "Not provided")}</strong>
      </div>
    `;
  }).join("");

  return `
    <tr class="full-record-row">
      <td colspan="${TABLE_COLUMN_COUNT}">
        <div class="full-record-card">
          <div class="full-record-heading">
            <div>
              <span>Complete learner record</span>
              <strong>${escapeHtml(formatStudentName(student))}</strong>
            </div>
            <button class="row-button" type="button" data-action="edit" data-id="${escapeHtml(student.id)}">Edit Full Record</button>
          </div>
          <div class="record-detail-grid">${details}</div>
        </div>
      </td>
    </tr>
  `;
}

function formatStudentName(student){
  const givenNames = [student.firstName, student.middleName, student.extension].filter(Boolean).join(" ");
  return [student.familyName, givenNames].filter(Boolean).join(", ");
}

function normalizeSearchText(value){
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatDate(value){
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if(!match){
    return value || "";
  }

  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
}

function ageFromBirthday(value){
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if(!match){
    return "";
  }

  const today = new Date();
  const birthYear = Number(match[1]);
  const birthMonth = Number(match[2]) - 1;
  const birthDay = Number(match[3]);
  let age = today.getFullYear() - birthYear;

  if(today.getMonth() < birthMonth || (today.getMonth() === birthMonth && today.getDate() < birthDay)){
    age -= 1;
  }

  return age >= 0 ? String(age) : "";
}

function openStudentDialog(student = null){
  studentForm.reset();
  formStatus.textContent = "";
  studentId.value = student ? student.id : "";
  dialogTitle.textContent = student ? "Edit Learner Record" : "Add Learner Record";
  saveStudentButton.textContent = student ? "Save Changes" : "Save Record";

  if(student){
    SHEET_FIELDS.forEach(field=>{
      const input = studentForm.elements.namedItem(field);
      if(input){
        if(input.tagName === "SELECT"){
          setSelectValue(input, student[field]);
        }else{
          input.value = student[field] || "";
        }
      }
    });
  }

  updateCode3ClassState();
  studentDialog.showModal();
  studentForm.elements.namedItem("gradeSection").focus();
}

function closeStudentDialog(){
  if(!saveStudentButton.disabled){
    studentDialog.close();
  }
}

async function saveStudent(event){
  event.preventDefault();
  formStatus.textContent = "";
  saveStudentButton.disabled = true;
  saveStudentButton.textContent = "Saving...";

  const record = {};
  SHEET_FIELDS.forEach(field=>{
    record[field] = String(studentForm.elements.namedItem(field).value || "").trim();
  });

  const id = studentId.value;
  const endpoint = id ? `/api/students/${encodeURIComponent(id)}` : "/api/students";
  const localRecord = {
    ...record,
    id:id || LearnerOffline.uuid(),
    createdAt:id ? students.find(student=>student.id === id)?.createdAt : new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };

  try{
    const response = await fetch(endpoint, {
      method:id ? "PUT" : "POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(localRecord)
    });
    const data = await response.json();

    if(!response.ok || !data.ok){
      throw new Error(data.message || "Unable to save this record.");
    }

    if(id){
      const index = students.findIndex(student=>student.id === id);
      if(index >= 0){
        students[index] = data.student;
      }
    }else{
      students.unshift(data.student);
    }
    await LearnerOffline.saveRecord(data.student);

    studentDialog.close();
    currentPage = 1;
    buildSectionFilter();
    applyFilters();
    recordsStatus.textContent = data.sheetSynced
      ? (id ? "Record updated in the app and Google Sheet." : "Record added to the app and Google Sheet.")
      : (id ? "Record updated in the app. Google Sheet sync needs setup." : "Record added to the app. Google Sheet sync needs setup.");
    window.setTimeout(()=>{ recordsStatus.textContent = ""; }, 2500);
  }catch(error){
    if(navigator.onLine && !(error instanceof TypeError)){
      formStatus.textContent = error.message;
    }else{
      await LearnerOffline.saveRecord(localRecord);
      await LearnerOffline.queueChange(id ? "PUT" : "POST", localRecord);
      const index = students.findIndex(student=>student.id === localRecord.id);
      if(index >= 0){
        students[index] = localRecord;
      }else{
        students.unshift(localRecord);
      }
      studentDialog.close();
      currentPage = 1;
      buildSectionFilter();
      buildRecordDropdowns();
      applyFilters();
      await updateSyncStatus("Record saved offline.");
    }
  }finally{
    saveStudentButton.disabled = false;
    saveStudentButton.textContent = id ? "Save Changes" : "Save Record";
  }
}

async function deleteStudent(student){
  const learnerName = formatStudentName(student);

  if(!window.confirm(`Delete the record for ${learnerName}? This cannot be undone.`)){
    return;
  }

  recordsStatus.textContent = "Deleting record...";

  try{
    const response = await fetch(`/api/students/${encodeURIComponent(student.id)}`, { method:"DELETE" });
    const data = await response.json();

    if(!response.ok || !data.ok){
      throw new Error(data.message || "Unable to delete this record.");
    }

    students = students.filter(item=>item.id !== student.id);
    buildSectionFilter();
    applyFilters();
    recordsStatus.textContent = data.sheetSynced
      ? "Record deleted from the app and Google Sheet."
      : "Record deleted from the app. Google Sheet sync needs setup.";
    window.setTimeout(()=>{ recordsStatus.textContent = ""; }, 2500);
  }catch(error){
    if(navigator.onLine && !(error instanceof TypeError)){
      recordsStatus.textContent = error.message;
    }else{
      await LearnerOffline.removeRecord(student.id);
      await LearnerOffline.queueChange("DELETE", student);
      students = students.filter(item=>item.id !== student.id);
      buildSectionFilter();
      applyFilters();
      await updateSyncStatus("Record deleted offline.");
    }
  }
}

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.getElementById("addStudentButton").addEventListener("click", ()=>openStudentDialog());
downloadClassButton.addEventListener("click", downloadSelectedClass);
document.getElementById("closeDialogButton").addEventListener("click", closeStudentDialog);
document.getElementById("cancelDialogButton").addEventListener("click", closeStudentDialog);
studentSearch.addEventListener("input", ()=>{
  currentPage = 1;
  applyFilters();
});
sectionFilter.addEventListener("change", ()=>{
  currentPage = 1;
  applyFilters();
});
studentForm.addEventListener("submit", saveStudent);
studentRows.addEventListener("click", event=>{
  const button = event.target.closest("[data-action]");

  if(!button){
    return;
  }

  const student = students.find(item=>item.id === button.dataset.id);

  if(!student){
    return;
  }

  if(button.dataset.action === "edit"){
    openStudentDialog(student);
  }else if(button.dataset.action === "move-up"){
    moveStudent(student, "up");
  }else if(button.dataset.action === "move-down"){
    moveStudent(student, "down");
  }else if(button.dataset.action === "view"){
    if(expandedStudentIds.has(student.id)){
      expandedStudentIds.delete(student.id);
    }else{
      expandedStudentIds.add(student.id);
    }
    renderStudents();
  }else if(button.dataset.action === "delete"){
    deleteStudent(student);
  }
});
previousPageButton.addEventListener("click", ()=>{
  if(currentPage > 1){
    currentPage -= 1;
    renderStudents();
  }
});
nextPageButton.addEventListener("click", ()=>{
  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  if(currentPage < totalPages){
    currentPage += 1;
    renderStudents();
  }
});
studentForm.elements.namedItem("birthday").addEventListener("change", event=>{
  const ageInput = studentForm.elements.namedItem("age");
  const calculatedAge = ageFromBirthday(event.target.value);

  if(calculatedAge !== ""){
    ageInput.value = calculatedAge;
  }
});
statusCodeInput.addEventListener("change", updateCode3ClassState);

updateLiveDateTime();
window.setInterval(updateLiveDateTime, 1000);
LearnerOffline.registerServiceWorker().catch(()=>{});
if(window.teacherEntryAllowed === false){
  // The entry guard is redirecting to Teacher Login.
}else if(!navigator.onLine && !LearnerOffline.hasOfflineSession()){
  window.location.replace("/teacher-login?next=/students");
}else{
  loadStudents();
}
window.addEventListener("online", async ()=>{
  recordsStatus.textContent = "Connection restored. Syncing changes...";
  try{
    await syncPendingChanges();
    await loadStudents();
  }catch(error){
    await updateSyncStatus(error.message);
  }
});
window.addEventListener("offline", ()=>updateSyncStatus("Offline mode."));
window.setInterval(()=>refreshSpreadsheetSections(true), 60 * 1000);
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    refreshSpreadsheetSections(true);
  }
});
