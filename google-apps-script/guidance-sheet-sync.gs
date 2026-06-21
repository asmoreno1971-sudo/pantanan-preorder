const GUIDANCE_SPREADSHEET_ID = "1MwsZdl1wPMdbYYBjrsGZOj5ECFprf-3hYoAJUmiF5KE";
const GUIDANCE_CASES_SHEET_NAME = "Guidance Cases";

const GUIDANCE_CASE_COLUMNS = [
  ["id", "ID"],
  ["caseNumber", "Case Number"],
  ["reportDate", "Report Date"],
  ["incidentDate", "Incident Date"],
  ["incidentTime", "Incident Time"],
  ["incidentLocation", "Incident Location"],
  ["primaryStudentId", "Primary Student ID"],
  ["primaryStudentName", "Primary Student Name"],
  ["primaryGradeSection", "Primary Grade / Section"],
  ["primaryRole", "Primary Role"],
  ["status", "Status"],
  ["guidanceLevel", "Guidance Level"],
  ["signatory", "Signatory"],
  ["createdAt", "Created At"],
  ["updatedAt", "Updated At"],
  ["json", "JSON"]
];

function jsonResponse(payload){
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean(value){
  return String(value == null ? "" : value).trim();
}

function guidanceSpreadsheet(){
  return SpreadsheetApp.openById(GUIDANCE_SPREADSHEET_ID);
}

function guidanceCasesSheet(){
  const spreadsheet = guidanceSpreadsheet();
  let sheet = spreadsheet.getSheetByName(GUIDANCE_CASES_SHEET_NAME);
  if(!sheet){
    sheet = spreadsheet.insertSheet(GUIDANCE_CASES_SHEET_NAME);
  }
  ensureGuidanceHeader(sheet);
  return sheet;
}

function ensureGuidanceHeader(sheet){
  const header = GUIDANCE_CASE_COLUMNS.map(([, label])=>label);
  const range = sheet.getRange(1, 1, 1, header.length);
  const current = range.getDisplayValues()[0];
  const missing = header.some((label, index)=>clean(current[index]) !== label);
  if(missing){
    range.setValues([header]);
    sheet.setFrozenRows(1);
  }
}

function caseRow(guidanceCase){
  const primary = guidanceCase && guidanceCase.primaryStudent || {};
  return GUIDANCE_CASE_COLUMNS.map(([key])=>{
    if(key === "primaryStudentId"){
      return clean(primary.id);
    }
    if(key === "primaryStudentName"){
      return clean(primary.name);
    }
    if(key === "primaryGradeSection"){
      return clean(primary.gradeSection);
    }
    if(key === "json"){
      return JSON.stringify(guidanceCase || {});
    }
    return clean(guidanceCase && guidanceCase[key]);
  });
}

function parseGuidanceCase(row, columns){
  const jsonText = clean(row[columns.json]);
  if(jsonText){
    try{
      const parsed = JSON.parse(jsonText);
      if(parsed && parsed.id){
        return parsed;
      }
    }catch(error){
      // Fall through to the visible columns.
    }
  }

  const primaryStudent = {
    id:clean(row[columns.primaryStudentId]),
    name:clean(row[columns.primaryStudentName]),
    gradeSection:clean(row[columns.primaryGradeSection])
  };
  return {
    id:clean(row[columns.id]),
    caseNumber:clean(row[columns.caseNumber]),
    reportDate:clean(row[columns.reportDate]),
    incidentDate:clean(row[columns.incidentDate]),
    incidentTime:clean(row[columns.incidentTime]),
    incidentLocation:clean(row[columns.incidentLocation]),
    primaryStudent,
    primaryRole:clean(row[columns.primaryRole]) || "Victim",
    involved:[],
    aggressionType:"",
    aggressionDetails:"",
    immediateResponse:"",
    referredTo:"",
    intervention:"",
    interventionDetails:"",
    advisers:[],
    adviserInformed:false,
    adviserInformedAt:"",
    status:clean(row[columns.status]) || "Open",
    guidanceLevel:clean(row[columns.guidanceLevel]),
    signatory:clean(row[columns.signatory]),
    createdAt:clean(row[columns.createdAt]),
    updatedAt:clean(row[columns.updatedAt])
  };
}

function guidanceColumnIndexes(){
  return GUIDANCE_CASE_COLUMNS.reduce((columns, [key], index)=>{
    columns[key] = index;
    return columns;
  }, {});
}

function listGuidanceCases(sheet){
  const values = sheet.getDataRange().getDisplayValues();
  const columns = guidanceColumnIndexes();
  return values.slice(1)
    .map(row=>parseGuidanceCase(row, columns))
    .filter(guidanceCase=>guidanceCase.id)
    .sort((a, b)=>clean(b.updatedAt || b.createdAt).localeCompare(clean(a.updatedAt || a.createdAt)));
}

function replaceGuidanceCases(sheet, cases){
  const values = (Array.isArray(cases) ? cases : []).map(caseRow);
  const lastRow = Math.max(sheet.getLastRow(), 2);
  if(lastRow > 1){
    sheet.getRange(2, 1, lastRow - 1, GUIDANCE_CASE_COLUMNS.length).clearContent();
  }
  if(values.length){
    sheet.getRange(2, 1, values.length, GUIDANCE_CASE_COLUMNS.length).setValues(values);
  }
}

function doPost(event){
  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try{
    const payload = JSON.parse(event.postData.contents || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("SYNC_SECRET");
    if(!expectedSecret || payload.secret !== expectedSecret){
      return jsonResponse({ ok:false, message:"Unauthorized sync request." });
    }

    const sheet = guidanceCasesSheet();
    if(payload.action === "list"){
      return jsonResponse({ ok:true, cases:listGuidanceCases(sheet) });
    }
    if(payload.action === "replace"){
      replaceGuidanceCases(sheet, payload.cases);
      return jsonResponse({ ok:true, count:Array.isArray(payload.cases) ? payload.cases.length : 0 });
    }

    return jsonResponse({ ok:false, message:"Unknown Guidance Sheet action." });
  }catch(error){
    return jsonResponse({ ok:false, message:error.message });
  }finally{
    lock.releaseLock();
  }
}
