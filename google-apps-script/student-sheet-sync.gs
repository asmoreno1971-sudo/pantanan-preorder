const STUDENT_SHEET_GID = 435948871;

const STUDENT_COLUMNS = [
  ["Grade/Section", "gradeSection"],
  ["Family Name", "familyName"],
  ["First Name", "firstName"],
  ["Middle Name", "middleName"],
  ["Extension", "extension"],
  ["Sex", "sex"],
  ["Age", "age"],
  ["Birthday", "birthday"],
  ["Status Code", "statusCode"],
  ["Date of Movement", "dateOfMovement"],
  ["If Code 3, which class?", "code3Class"],
  ["LRN", "lrn"],
  ["Address", "address"],
  ["Father", "father"],
  ["Mother", "mother"],
  ["Guardian", "guardian"],
  ["Contact Number", "contactNumber"]
];

function jsonResponse(payload){
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean(value){
  return String(value == null ? "" : value).trim();
}

function sheetByGid(){
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheets()
    .find(candidate=>candidate.getSheetId() === STUDENT_SHEET_GID);
  if(!sheet){
    throw new Error(`Student sheet with gid ${STUDENT_SHEET_GID} was not found.`);
  }
  return sheet;
}

function headerMap(sheet){
  const values = sheet.getDataRange().getDisplayValues();
  const headerIndex = values.findIndex(row=>row.includes("Grade/Section"));
  if(headerIndex < 0){
    throw new Error("The Grade/Section header row was not found.");
  }

  const headers = values[headerIndex];
  const columns = {};
  STUDENT_COLUMNS.forEach(([label, key])=>{
    const index = headers.indexOf(label);
    if(index >= 0){
      columns[key] = index;
    }
  });
  return { values, headerIndex, columns };
}

function sameLearner(row, student, columns){
  const lrn = clean(student && student.lrn);
  if(lrn && columns.lrn !== undefined){
    return clean(row[columns.lrn]) === lrn;
  }

  return ["gradeSection", "familyName", "firstName"].every(key=>
    columns[key] !== undefined
      && clean(row[columns[key]]).toUpperCase() === clean(student && student[key]).toUpperCase()
  );
}

function findStudentRow(values, headerIndex, columns, student, previousStudent){
  for(let index = headerIndex + 1; index < values.length; index += 1){
    if(sameLearner(values[index], student, columns)
      || (previousStudent && sameLearner(values[index], previousStudent, columns))){
      return index + 1;
    }
  }
  return 0;
}

function writeStudentRow(sheet, rowNumber, student, columns){
  Object.keys(columns).forEach(key=>{
    sheet.getRange(rowNumber, columns[key] + 1).setValue(clean(student[key]));
  });
}

function doPost(event){
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);

  try{
    const payload = JSON.parse(event.postData.contents || "{}");
    const expectedSecret = PropertiesService.getScriptProperties().getProperty("SYNC_SECRET");
    if(!expectedSecret || payload.secret !== expectedSecret){
      return jsonResponse({ ok:false, message:"Unauthorized sync request." });
    }

    const sheet = sheetByGid();
    const { values, headerIndex, columns } = headerMap(sheet);
    const student = payload.student || {};
    const rowNumber = findStudentRow(values, headerIndex, columns, student, payload.previousStudent);

    if(payload.action === "delete"){
      if(rowNumber){
        sheet.deleteRow(rowNumber);
      }
      return jsonResponse({ ok:true, action:"delete", rowNumber });
    }

    const destinationRow = rowNumber || Math.max(sheet.getLastRow() + 1, headerIndex + 2);
    writeStudentRow(sheet, destinationRow, student, columns);
    return jsonResponse({
      ok:true,
      action:rowNumber ? "update" : "create",
      rowNumber:destinationRow
    });
  }catch(error){
    return jsonResponse({ ok:false, message:error.message });
  }finally{
    lock.releaseLock();
  }
}
