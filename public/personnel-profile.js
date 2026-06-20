const profileForm = document.getElementById("personnelProfileForm");
const personnelName = document.getElementById("personnelName");
const profileSyncStatus = document.getElementById("profileSyncStatus");
const profileFormMessage = document.getElementById("profileFormMessage");
const saveProfileButton = document.getElementById("saveProfileButton");
const dynamicProfileFields = document.getElementById("dynamicProfileFields");
const personnelNameOptions = document.getElementById("personnelNameOptions");
const teacherPhotoInput = document.getElementById("teacherPhotoInput");
const teacherPhotoCanvas = document.getElementById("teacherPhotoCanvas");

const teacherDirectoryKey = "bakhawTeacherDirectory";
const personnelStorageKey = "bakhawPersonnelProfiles";
const personnelProfilesKey = "bakhawPersonnelProfileRecords";
const personnelFieldsKey = "bakhawPersonnelProfileFields";
const gradeSectionsKey = "bakhawGradeSections";
const pendingProfilesKey = "bakhawPersonnelProfilePending";
const currentTeacherKey = "bakhawCurrentTeacherSession";
const specialAssignmentOptions = ["Special Teacher - Elementary", "Special Teacher - JHS"];

let teacherDirectory = [];
let officialPersonnel = [];
let profiles = [];
let profileFields = normalizeProfileFields(storageList(personnelFieldsKey));
let gradeSections = storageList(gradeSectionsKey);
let currentTeacherName = "";
let syncInFlight = false;
let teacherPhotoImage = null;
let currentPhotoDataUrl = "";
let schoolLogoImage = null;
let lastProfileSyncError = "";

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

function storageList(key){
  try{
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved : [];
  }catch{
    return [];
  }
}

function saveStorageList(key, value){
  localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

function clearLegacyPhotoCache(){
  localStorage.removeItem("bakhawPersonnelProfilePhotos");
}

function loadSavedPersonnelPhoto(name){
  const profile = currentProfileForName(name);
  const dataUrl = profile.photoDataUrl || "";
  if(!dataUrl){
    currentPhotoDataUrl = "";
    teacherPhotoImage = null;
    renderTeacherPhotoFrame();
    return;
  }
  currentPhotoDataUrl = dataUrl;
  loadImage(dataUrl)
    .then(image=>{
      teacherPhotoImage = image;
      renderTeacherPhotoFrame();
    })
    .catch(()=>{
      teacherPhotoImage = null;
      renderTeacherPhotoFrame();
    });
}

function fieldId(label){
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"");
}

function normalizeProfileFields(fields){
  const source = Array.isArray(fields) && fields.length ? fields : defaultProfileFields();
  return source
    .map((field,index)=>{
      const label = normalizeName(field?.label || field?.name || field || "");
      const options = Array.isArray(field?.options) ? field.options : [];
      return {
        id:fieldId(field?.id || label) || `field-${index + 1}`,
        label,
        options:[...new Map(options
          .map(option=>normalizeName(option))
          .filter(Boolean)
          .map(option=>[option.toLowerCase(), option])).values()]
      };
    })
    .filter(field=>field.label && field.id !== "name");
}

function defaultProfileFields(){
  return [
    "Sex",
    "Birthday",
    "Position",
    "Department",
    "Advisory / Assignment",
    "Contact Number",
    "DepEd Email",
    "Address",
    "Emergency Contact",
    "Employee No.",
    "GSIS",
    "PhilHealth",
    "TIN",
    "PAG-IBIG",
    "PRC License No.",
    "Notes"
  ].map(label=>({ id:fieldId(label), label }));
}

function normalizeName(value){
  return String(value || "").trim().replace(/\s+/g," ");
}

function isDateField(field){
  return field?.id === "birthday" || String(field?.id || "").includes("date");
}

function isPrcExpiryDateField(field){
  const id = String(field?.id || "");
  return id.includes("expiry") && id.includes("prc");
}

function formatDateValue(value){
  const cleanValue = String(value || "").trim();
  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(isoMatch){
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }
  const slashMatch = cleanValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if(slashMatch){
    const year = slashMatch[3].length === 2 ? `19${slashMatch[3]}` : slashMatch[3];
    return `${slashMatch[1].padStart(2,"0")}/${slashMatch[2].padStart(2,"0")}/${year}`;
  }
  return cleanValue;
}

function loadImage(src){
  return new Promise((resolve,reject)=>{
    const image = new Image();
    image.onload = ()=>resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawCoverImage(context,image,x,y,width,height){
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  context.drawImage(image,sourceX,sourceY,sourceWidth,sourceHeight,x,y,width,height);
}

function wrappedCanvasText(context,text,x,y,maxWidth,lineHeight,maxLines){
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach(word=>{
    const nextLine = line ? `${line} ${word}` : word;
    if(context.measureText(nextLine).width <= maxWidth || !line){
      line = nextLine;
      return;
    }
    lines.push(line);
    line = word;
  });
  if(line){
    lines.push(line);
  }
  lines.slice(0,maxLines).forEach((item,index)=>{
    const display = index === maxLines - 1 && lines.length > maxLines ? `${item.replace(/\s+\S+$/,"")}...` : item;
    context.fillText(display,x,y + (index * lineHeight));
  });
}

function currentProfileForFrame(){
  return currentProfileForName(selectedPersonnelName());
}

function photoFrameSubtitle(profile){
  return profileFieldValue(profile,{ id:"position" })
    || profileFieldValue(profile,{ id:"advisory-assignment" })
    || "Bakhaw Integrated School Personnel";
}

function renderTeacherPhotoFrame(){
  if(!teacherPhotoCanvas){
    return;
  }
  const context = teacherPhotoCanvas.getContext("2d");
  const width = teacherPhotoCanvas.width;
  const height = teacherPhotoCanvas.height;
  const profile = currentProfileForFrame();
  const name = normalizeName(profile.name || selectedPersonnelName()) || "Teacher Name";

  context.fillStyle = "#fffefa";
  context.fillRect(0,0,width,height);

  const photoX = 17;
  const photoY = 17;
  const photoW = width - 34;
  const photoH = height - 34;
  context.fillStyle = "#edf7f1";
  context.fillRect(photoX,photoY,photoW,photoH);
  if(teacherPhotoImage){
    drawCoverImage(context,teacherPhotoImage,photoX,photoY,photoW,photoH);
  }else{
    context.fillStyle = "#62766d";
    context.font = "800 12px Segoe UI, Arial, sans-serif";
    context.textAlign = "center";
    context.fillText("UPLOAD TEACHER PHOTO",width / 2,photoY + (photoH / 2));
    context.textAlign = "left";
  }

  context.fillStyle = "rgba(11,104,66,.92)";
  context.fillRect(17,height - 52,width - 34,35);
  context.fillStyle = "#ffffff";
  context.font = "900 12px Segoe UI, Arial, sans-serif";
  context.textAlign = "center";
  wrappedCanvasText(context,name.toUpperCase(),width / 2,height - 31,width - 52,13,1);
  context.textAlign = "left";

  context.strokeStyle = "#0b6842";
  context.lineWidth = 9;
  context.strokeRect(6,6,width - 12,height - 12);
  context.strokeStyle = "#f0c75e";
  context.lineWidth = 3;
  context.strokeRect(14,14,width - 28,height - 28);
}

function teacherDisplayName(teacher){
  return normalizeName(teacher?.displayName || teacher?.name || teacher?.username || "");
}

function profileKey(name){
  return normalizeName(name).toLowerCase();
}

function nameTokens(name){
  return profileKey(name)
    .replace(/[^a-z0-9\s]/g," ")
    .split(/\s+/)
    .filter(Boolean);
}

function meaningfulNameTokens(name){
  return nameTokens(name).filter(token=>token.length > 1 && !["jr","sr","ii","iii","iv"].includes(token));
}

function samePersonName(a,b){
  const left = nameTokens(a);
  const right = nameTokens(b);
  if(!left.length || !right.length){
    return false;
  }
  if(left.join(" ") === right.join(" ")){
    return true;
  }
  const leftMeaningful = meaningfulNameTokens(a);
  const rightMeaningful = meaningfulNameTokens(b);
  const smaller = leftMeaningful.length <= rightMeaningful.length ? leftMeaningful : rightMeaningful;
  const larger = leftMeaningful.length > rightMeaningful.length ? leftMeaningful : rightMeaningful;
  return smaller.length >= 2 && smaller.every(token=>larger.includes(token));
}

function officialPersonnelName(item){
  return normalizeName(item?.name || item || "");
}

function officialPersonnelNames(){
  return officialPersonnel.map(officialPersonnelName).filter(Boolean);
}

function matchingOfficialName(name){
  const key = profileKey(name);
  if(!key){
    return "";
  }
  return officialPersonnelNames().find(officialName=>profileKey(officialName) === key)
    || officialPersonnelNames().find(officialName=>samePersonName(name, officialName))
    || "";
}

function currentTeacherCanSaveProfile(name){
  return samePersonName(name, currentTeacherName || personnelName.value);
}

function profileFetch(url, options = {}, timeoutMs = 15000){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(), timeoutMs);
  return fetch(url,{...options,signal:controller.signal}).finally(()=>window.clearTimeout(timeout));
}

async function saveProfileOnline(profile, timeoutMs = 45000){
  const response = await profileFetch("/api/personnel-profiles", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ profile })
  }, timeoutMs);
  const data = await response.json();
  if(response.status === 401){
    const error = new Error("Profile saved locally. Sign in from Dashboard later if you need to sync it online.");
    error.status = response.status;
    throw error;
  }
  if(!response.ok || !data.ok){
    const error = new Error(data.message || "Profile could not be saved.");
    error.status = response.status;
    throw error;
  }
  return data.profile || profile;
}

function uniqueTeacherNames(){
  const names = teacherDirectory.map(teacherDisplayName).filter(Boolean);
  return [...new Map(names.map(name=>[profileKey(name), name])).values()]
    .sort((a,b)=>a.localeCompare(b));
}

function savedCurrentTeacher(){
  try{
    return JSON.parse(localStorage.getItem(currentTeacherKey) || "null") || null;
  }catch{
    return null;
  }
}

function saveCurrentTeacher(teacher){
  if(!teacher?.displayName && !teacher?.username){
    return;
  }
  localStorage.setItem(currentTeacherKey, JSON.stringify({
    username:String(teacher.username || "").trim().toLowerCase(),
    displayName:normalizeName(teacher.displayName || teacher.name || teacher.username || ""),
    savedAt:new Date().toISOString()
  }));
}

function requestedPersonnelName(){
  const params = new URLSearchParams(window.location.search);
  return normalizeName(params.get("name") || params.get("personnel") || "");
}

function selectedPersonnelName(){
  return normalizeName(personnelName.value || requestedPersonnelName() || currentTeacherName);
}

function renderPersonnelNameOptions(){
  if(!personnelNameOptions){
    return;
  }
  const names = [
    ...officialPersonnelNames(),
    ...profiles.map(profile=>profile.name),
    ...uniqueTeacherNames(),
    currentTeacherName
  ].map(normalizeName).filter(Boolean);
  const uniqueNames = [...new Map(names.map(name=>[profileKey(name), name])).values()]
    .sort((a,b)=>a.localeCompare(b));
  personnelNameOptions.innerHTML = uniqueNames
    .map(name=>`<option value="${escapeHtml(name)}"></option>`)
    .join("");
}

function setPersonnelProfileName(name){
  const cleanName = matchingOfficialName(name) || normalizeName(name);
  if(!cleanName){
    return;
  }
  profiles = mergeProfileLists(profiles, storedPersonnelProfiles());
  personnelName.value = cleanName;
  setFormProfile(currentProfileForName(cleanName));
  loadSavedPersonnelPhoto(cleanName);
}

function showSelectedPersonnelSavedData(){
  const name = selectedPersonnelName();
  if(!name){
    return;
  }
  setPersonnelProfileName(name);
}

function setCurrentTeacherName(name){
  const cleanName = matchingOfficialName(name) || normalizeName(name);
  if(!cleanName){
    return;
  }
  currentTeacherName = cleanName;
  if(!requestedPersonnelName() && !personnelName.value){
    setPersonnelProfileName(cleanName);
  }
  renderPersonnelNameOptions();
}

function blankProfile(name = ""){
  const fields = Object.fromEntries(profileFields.map(field=>[field.id, ""]));
  return {
    name,
    fields,
    sex:"",
    birthday:"",
    position:"",
    department:"",
    advisory:"",
    contactNumber:"",
    depedEmail:"",
    address:"",
    emergencyContact:"",
    employeeNumber:"",
    gsis:"",
    philHealth:"",
    tin:"",
    pagibig:"",
    prcLicense:"",
    notes:"",
    photoDataUrl:""
  };
}

function profileFieldValue(profile, field){
  if(!profile || !field){
    return "";
  }
  return profile.fields?.[field.id] || profile[field.id] || legacyProfileValue(profile, field.id) || "";
}

function profileHasSavedDetails(profile){
  if(!profile){
    return false;
  }
  return profileFields.some(field=>String(profileFieldValue(profile, field) || "").trim());
}

function mergeProfileData(existing = {}, incoming = {}){
  const mergedFields = { ...(existing.fields || {}) };
  Object.entries(incoming.fields || {}).forEach(([key,value])=>{
    if(String(value || "").trim() || !(key in mergedFields)){
      mergedFields[key] = value;
    }
  });
  const merged = { ...existing };
  Object.entries(incoming).forEach(([key,value])=>{
    if(key === "fields"){
      return;
    }
    if(String(value || "").trim() || !String(merged[key] || "").trim()){
      merged[key] = value;
    }
  });
  return { ...merged, fields:mergedFields };
}

function mergeProfileLists(...lists){
  const merged = new Map();
  lists.flat().filter(profile=>profile?.name).forEach(profile=>{
    const key = profileKey(profile.name);
    const existing = merged.get(key);
    if(!existing){
      merged.set(key, profile);
      return;
    }
    const existingHasDetails = profileHasSavedDetails(existing);
    const profileHasDetails = profileHasSavedDetails(profile);
    if(profileHasDetails && !existingHasDetails){
      merged.set(key, mergeProfileData(existing, profile));
      return;
    }
    if(profileHasDetails === existingHasDetails && String(profile.updatedAt || "") > String(existing.updatedAt || "")){
      merged.set(key, mergeProfileData(existing, profile));
      return;
    }
    if(profileHasDetails){
      merged.set(key, mergeProfileData(profile, existing));
    }
  });
  return [...merged.values()];
}

function storedPersonnelProfiles(){
  const profileRecords = storageList(personnelProfilesKey);
  const personnelRecords = storageList(personnelStorageKey).filter(profile=>profileHasSavedDetails(profile));
  return mergeProfileLists(profileRecords, personnelRecords);
}

function currentProfileForName(name){
  const officialName = matchingOfficialName(name) || name;
  const key = profileKey(officialName);
  const savedProfile = profiles.find(profile=>profileKey(profile.name) === key)
    || profiles.find(profile=>samePersonName(profile.name, officialName));
  return savedProfile ? { ...savedProfile, name:officialName } : blankProfile(officialName);
}

function legacyProfileValue(profile, id){
  const legacyValues = {
    sex:profile.sex,
    birthday:profile.birthday,
    position:profile.position,
    department:profile.department,
    "advisory-assignment":profile.advisory,
    contact:profile.contactNumber || profile.fields?.["contact-number"],
    "contact-number":profile.contactNumber,
    "deped-email":profile.depedEmail,
    address:profile.address,
    "emergency-contact":profile.emergencyContact,
    "employee-no":profile.employeeNumber,
    gsis:profile.gsis,
    philhealth:profile.philHealth,
    tin:profile.tin,
    "pag-ibig":profile.pagibig,
    "prc-license-no":profile.prcLicense,
    notes:profile.notes
  };
  return legacyValues[id] || "";
}

function setFormProfile(profile){
  personnelName.value = profile.name || "";
  currentPhotoDataUrl = profile.photoDataUrl || "";
  profileFields.forEach(field=>{
    const input = profileForm.elements[`field:${field.id}`];
    if(input){
      const value = profileFieldValue(profile, field);
      const displayValue = isDateField(field) ? formatDateValue(value) : value;
      if(input.tagName === "SELECT" && displayValue && ![...input.options].some(option=>option.value === displayValue)){
        input.appendChild(new Option(displayValue, displayValue));
      }
      input.value = displayValue;
      if(isDateField(field)){
        setDateRollerValue(field.id, displayValue);
      }
      autoResizeTextarea(input);
    }
  });
  renderTeacherPhotoFrame();
}

function profileFromForm(){
  const formData = new FormData(profileForm);
  const profile = blankProfile(normalizeName(formData.get("name")));
  profileFields.forEach(field=>{
    const value = String(formData.get(`field:${field.id}`) || "").trim();
    profile.fields[field.id] = isDateField(field) ? formatDateValue(value) : value;
  });
  profile.sex = profile.fields.sex || "";
  profile.birthday = profile.fields.birthday || "";
  profile.position = profile.fields.position || "";
  profile.department = profile.fields.department || "";
  profile.advisory = profile.fields["advisory-assignment"] || "";
  profile.contactNumber = profile.fields["contact-number"] || profile.fields.contact || "";
  profile.depedEmail = String(profile.fields["deped-email"] || "").toLowerCase();
  profile.address = profile.fields.address || "";
  profile.emergencyContact = profile.fields["emergency-contact"] || "";
  profile.employeeNumber = profile.fields["employee-no"] || "";
  profile.gsis = profile.fields.gsis || "";
  profile.philHealth = profile.fields.philhealth || "";
  profile.tin = profile.fields.tin || "";
  profile.pagibig = profile.fields["pag-ibig"] || "";
  profile.prcLicense = profile.fields["prc-license-no"] || "";
  profile.notes = profile.fields.notes || "";
  profile.photoDataUrl = currentPhotoDataUrl;
  profile.updatedAt = new Date().toISOString();
  return profile;
}

function renderProfileFields(){
  dynamicProfileFields.innerHTML = profileFields.map(field=>`
    <section class="form-section dynamic-field-section">
      <h3>${escapeHtml(field.label)}</h3>
      <label>
        ${fieldInputMarkup(field)}
      </label>
    </section>
  `).join("");
  dynamicProfileFields.querySelectorAll("textarea").forEach(textarea=>{
    textarea.addEventListener("input",()=>autoResizeTextarea(textarea));
    autoResizeTextarea(textarea);
  });
  dynamicProfileFields.querySelectorAll("input,select,textarea").forEach(input=>{
    input.addEventListener("input",renderTeacherPhotoFrame);
    input.addEventListener("change",renderTeacherPhotoFrame);
  });
  bindDateRollers();
  if(selectedPersonnelName()){
    setPersonnelProfileName(selectedPersonnelName());
  }
}

function fieldInputMarkup(field){
  if(field.id === "sex"){
    return sexSelectMarkup(field);
  }
  if(isDateField(field)){
    return dateInputMarkup(field);
  }
  if(field.id === "advisory-assignment"){
    return advisorySelectMarkup(field);
  }
  if(field.id === "year-started-at-deped"){
    return yearStartedSelectMarkup(field);
  }
  if(field.options?.length){
    return profileOptionSelectMarkup(field);
  }
  return answerTextareaMarkup(field);
}

function answerTextareaMarkup(field){
  return `<textarea name="field:${escapeHtml(field.id)}" rows="1" placeholder="Enter ${escapeHtml(field.label)}"></textarea>`;
}

function sexSelectMarkup(field){
  return `
    <select name="field:${escapeHtml(field.id)}">
      <option value="">Select Sex</option>
      <option>Male</option>
      <option>Female</option>
    </select>`;
}

function dateInputMarkup(field){
  const escapedId = escapeHtml(field.id);
  const currentYear = new Date().getFullYear();
  const firstYear = isPrcExpiryDateField(field) ? 2026 : 1965;
  const lastYear = isPrcExpiryDateField(field) ? 2035 : currentYear;
  const monthOptions = Array.from({ length:12 },(_,index)=>String(index + 1).padStart(2,"0"))
    .map(month=>`<option value="${month}">${month}</option>`)
    .join("");
  const dayOptions = Array.from({ length:31 },(_,index)=>String(index + 1).padStart(2,"0"))
    .map(day=>`<option value="${day}">${day}</option>`)
    .join("");
  const yearOptions = Array.from({ length:lastYear - firstYear + 1 },(_,index)=>String(firstYear + index))
    .map(year=>`<option value="${year}">${year}</option>`)
    .join("");
  return `
    <div class="date-roller-wrap">
      <input name="field:${escapedId}" type="hidden">
      <select data-date-for="field:${escapedId}" data-date-part="month" aria-label="${escapeHtml(field.label)} month">
        <option value="">MM</option>
        ${monthOptions}
      </select>
      <select data-date-for="field:${escapedId}" data-date-part="day" aria-label="${escapeHtml(field.label)} day">
        <option value="">DD</option>
        ${dayOptions}
      </select>
      <select data-date-for="field:${escapedId}" data-date-part="year" aria-label="${escapeHtml(field.label)} year">
        <option value="">YYYY</option>
        ${yearOptions}
      </select>
    </div>`;
}

function yearStartedSelectMarkup(field){
  const currentYear = new Date().getFullYear();
  const options = Array.from({ length:currentYear - 1980 + 1 },(_,index)=>String(1980 + index))
    .map(year=>`<option value="${year}">${year}</option>`)
    .join("");
  return `
    <select name="field:${escapeHtml(field.id)}">
      <option value="">Select Year</option>
      ${options}
    </select>`;
}

function profileOptionSelectMarkup(field){
  const options = field.options
    .map(option=>`<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
    .join("");
  return `
    <select name="field:${escapeHtml(field.id)}">
      <option value="">Select ${escapeHtml(field.label)}</option>
      ${options}
    </select>`;
}

function advisorySelectMarkup(field){
  const choices = [...new Map([...gradeSections, ...specialAssignmentOptions]
    .map(section=>String(section || "").trim())
    .filter(Boolean)
    .map(section=>[section.toLowerCase(), section])).values()];
  const options = choices.map(section=>`<option value="${escapeHtml(section)}">${escapeHtml(section)}</option>`).join("");
  return `
    <select name="field:${escapeHtml(field.id)}">
      <option value="">Select Grade / Section</option>
      ${options}
    </select>`;
}

function parseMmDdYyyy(value){
  const match = String(value || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? { month:match[1], day:match[2], year:match[3] } : null;
}

function bindDateRollers(){
  dynamicProfileFields.querySelectorAll(".date-roller-wrap").forEach(wrapper=>{
    wrapper.querySelectorAll("select").forEach(select=>{
      select.addEventListener("change",()=>updateDateRollerValue(select.dataset.dateFor));
    });
  });
}

function setDateRollerValue(fieldIdValue, value){
  const parsed = parseMmDdYyyy(formatDateValue(value));
  const inputName = `field:${fieldIdValue}`;
  const hiddenInput = profileForm.elements[inputName];
  if(hiddenInput){
    hiddenInput.value = parsed ? `${parsed.month}/${parsed.day}/${parsed.year}` : "";
  }
  ["month","day","year"].forEach(part=>{
    const select = dynamicProfileFields.querySelector(`[data-date-for="${inputName}"][data-date-part="${part}"]`);
    if(!select){
      return;
    }
    const partValue = parsed?.[part] || "";
    if(partValue && ![...select.options].some(option=>option.value === partValue)){
      select.appendChild(new Option(partValue, partValue));
    }
    select.value = partValue;
  });
}

function updateDateRollerValue(inputName){
  const hiddenInput = profileForm.elements[inputName];
  if(!hiddenInput){
    return;
  }
  const partValue = part=>{
    const select = dynamicProfileFields.querySelector(`[data-date-for="${inputName}"][data-date-part="${part}"]`);
    return select?.value || "";
  };
  const month = partValue("month");
  const day = partValue("day");
  const year = partValue("year");
  hiddenInput.value = month && day && year ? `${month}/${day}/${year}` : "";
}

function autoResizeTextarea(textarea){
  if(!textarea || textarea.tagName !== "TEXTAREA"){
    return;
  }
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function upsertLocalProfile(profile){
  const officialName = matchingOfficialName(profile.name) || profile.name;
  profile.name = officialName;
  const key = profileKey(officialName);
  const index = profiles.findIndex(item=>profileKey(item.name) === key || samePersonName(item.name, officialName));
  if(index >= 0){
    profiles[index] = mergeProfileData(profiles[index], profile);
  }else{
    profiles.unshift(profile);
  }
  saveStorageList(personnelProfilesKey, profiles);
  saveStorageList(personnelStorageKey, mergeProfileLists(storageList(personnelStorageKey), profiles));
}

function alignProfilesToOfficialPersonnel(includeStored = true){
  if(!officialPersonnel.length){
    return;
  }
  profiles = includeStored ? mergeProfileLists(profiles, storedPersonnelProfiles()) : mergeProfileLists(profiles);
  const profilesByName = new Map(profiles.map(profile=>[profileKey(profile.name), profile]));
  const officialProfiles = officialPersonnelNames().map(name=>{
    const savedProfile = profilesByName.get(profileKey(name))
      || profiles.find(profile=>samePersonName(profile.name, name));
    return savedProfile ? { ...savedProfile, name } : blankProfile(name);
  });
  const extraProfiles = profiles.filter(profile=>!officialPersonnelNames().some(name=>samePersonName(profile.name, name)));
  profiles = [...officialProfiles, ...extraProfiles];
  saveStorageList(personnelProfilesKey, profiles);
  renderPersonnelNameOptions();
}

function queueProfile(profile){
  const pending = storageList(pendingProfilesKey);
  const key = profileKey(profile.name);
  const index = pending.findIndex(item=>profileKey(item.name) === key);
  if(index >= 0){
    pending[index] = profile;
  }else{
    pending.push(profile);
  }
  saveStorageList(pendingProfilesKey, pending);
}

function pendingCount(){
  return storageList(pendingProfilesKey).length;
}

function updateSyncStatus(message){
  const pending = pendingCount();
  const suffix = pending ? ` ${pending} profile${pending === 1 ? "" : "s"} waiting to sync.` : "";
  profileSyncStatus.textContent = `${message}${suffix}`;
}

async function loadTeacherDirectory(){
  teacherDirectory = storageList(teacherDirectoryKey);
  if(!navigator.onLine){
    if(!teacherDirectory.length){
      updateSyncStatus("Connect once to load the teacher list.");
    }
    return;
  }
  try{
    const response = await profileFetch("/api/teacher-directory", { cache:"no-store" });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Teacher list could not be loaded.");
    }
    teacherDirectory = Array.isArray(data.teachers) ? data.teachers : [];
    saveStorageList(teacherDirectoryKey, teacherDirectory);
    renderPersonnelNameOptions();
  }catch{
    if(!teacherDirectory.length){
      updateSyncStatus("Teacher list could not be loaded. Try again with internet.");
    }
  }
}

async function loadGradeSections(){
  gradeSections = storageList(gradeSectionsKey);
  if(gradeSections.length){
    renderProfileFields();
  }
  if(!navigator.onLine){
    return;
  }
  try{
    const response = await profileFetch("/api/grade-sections", { cache:"no-store" });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Grade / Sections could not be loaded.");
    }
    gradeSections = Array.isArray(data.sections) ? data.sections : [];
    saveStorageList(gradeSectionsKey, gradeSections);
    renderProfileFields();
  }catch{
    // Saved Grade / Sections remain the offline fallback.
  }
}

async function loadPersonnelSource(){
  officialPersonnel = storageList(personnelStorageKey);
  alignProfilesToOfficialPersonnel();
  if(!navigator.onLine){
    return;
  }
  try{
    const response = await profileFetch("/api/personnel", { cache:"no-store" });
    const data = await response.json();
    if(response.ok && data.ok){
      officialPersonnel = Array.isArray(data.personnel) ? data.personnel : [];
      if(Array.isArray(data.fields)){
        profileFields = normalizeProfileFields(data.fields);
        saveStorageList(personnelFieldsKey, profileFields);
        renderProfileFields();
      }
      saveStorageList(personnelStorageKey, officialPersonnel);
      alignProfilesToOfficialPersonnel();
      if(selectedPersonnelName()){
        setPersonnelProfileName(selectedPersonnelName());
      }
    }
  }catch{
    // Saved Personnel Consol list remains the offline fallback.
  }
}

async function loadCurrentTeacher(){
  const saved = savedCurrentTeacher();
  if(saved?.displayName){
    setCurrentTeacherName(saved.displayName);
  }
  if(requestedPersonnelName()){
    setPersonnelProfileName(requestedPersonnelName());
  }
  if(!navigator.onLine){
    return;
  }
  try{
    const response = await profileFetch("/api/teacher-session", { cache:"no-store" });
    const session = await response.json();
    if(response.ok && session?.ok && session.displayName){
      saveCurrentTeacher(session);
      setCurrentTeacherName(session.displayName);
      if(requestedPersonnelName()){
        setPersonnelProfileName(requestedPersonnelName());
      }
      return;
    }
  }catch{
    // Saved session name remains the offline fallback.
  }
}

async function loadProfiles(){
  profiles = storedPersonnelProfiles();
  alignProfilesToOfficialPersonnel();
  showSelectedPersonnelSavedData();
  updateSyncStatus(profiles.length ? "Saved personnel profiles shown." : "No saved personnel profiles yet.");
  if(!navigator.onLine){
    updateSyncStatus(profiles.length ? "Offline mode: saved profiles shown." : "No offline personnel profiles are saved yet.");
    return;
  }
  try{
    await syncPendingProfiles();
    const response = await profileFetch("/api/personnel-profiles", { cache:"no-store" });
    const data = await response.json();
    if(response.status === 401){
      throw new Error("Saved personnel profiles shown. Sign in from Dashboard to refresh online records.");
    }
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Personnel profiles could not be loaded.");
    }
    if(Array.isArray(data.personnel)){
      officialPersonnel = data.personnel;
      saveStorageList(personnelStorageKey, officialPersonnel);
    }
    if(Array.isArray(data.fields)){
      profileFields = normalizeProfileFields(data.fields);
      saveStorageList(personnelFieldsKey, profileFields);
      renderProfileFields();
    }
    profiles = mergeProfileLists(
      Array.isArray(data.profiles) ? data.profiles : [],
      storageList(pendingProfilesKey)
    );
    alignProfilesToOfficialPersonnel(false);
    saveStorageList(personnelProfilesKey, profiles);
    updateSyncStatus(`${profiles.length.toLocaleString()} personnel profile${profiles.length === 1 ? "" : "s"} loaded.`);
    showSelectedPersonnelSavedData();
  }catch(error){
    showSelectedPersonnelSavedData();
    updateSyncStatus(profiles.length ? "Saved profiles shown. Reconnect to refresh." : (error.message || "Personnel profiles could not be loaded."));
  }
}

async function syncPendingProfiles(){
  if(syncInFlight || !navigator.onLine){
    return { synced:false, remaining:pendingCount(), error:lastProfileSyncError };
  }
  const pending = storageList(pendingProfilesKey);
  if(!pending.length){
    lastProfileSyncError = "";
    return { synced:true, remaining:0, error:"" };
  }
  syncInFlight = true;
  let lastError = "";
  try{
    const remaining = [];
    for(const profile of pending){
      try{
        const savedProfile = await saveProfileOnline(profile);
        if(!savedProfile){
          return { synced:false, remaining:pending.length, error:lastProfileSyncError };
        }
        upsertLocalProfile(savedProfile);
      }catch(error){
        lastError = error.message || "Profile could not be synchronized.";
        remaining.push(profile);
      }
    }
    saveStorageList(pendingProfilesKey, remaining);
    lastProfileSyncError = remaining.length ? lastError : "";
    return { synced:!remaining.length, remaining:remaining.length, error:lastProfileSyncError };
  }finally{
    syncInFlight = false;
  }
}

profileForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const profile = profileFromForm();
  const officialName = matchingOfficialName(profile.name);
  if(officialName){
    profile.name = officialName;
  }
  if(!profile.name){
    profileFormMessage.textContent = "Select a personnel name first.";
    return;
  }
  if(officialPersonnel.length && !matchingOfficialName(profile.name) && !currentTeacherCanSaveProfile(profile.name)){
    profileFormMessage.textContent = "Your name is not listed in the teacher directory.";
    return;
  }
  saveProfileButton.disabled = true;
  saveProfileButton.textContent = "Saving...";
  upsertLocalProfile(profile);
  try{
    if(!navigator.onLine){
      throw new Error("offline");
    }
    const savedProfile = await saveProfileOnline(profile);
    if(!savedProfile){
      return;
    }
    upsertLocalProfile(savedProfile);
    setFormProfile(profile);
    profileFormMessage.textContent = `${profile.name} profile saved.`;
  }catch(error){
    if(error.status && error.status < 500){
      profileFormMessage.textContent = error.message;
      return;
    }
    lastProfileSyncError = error.message || "Profile could not be synchronized.";
    queueProfile(profile);
    setFormProfile(profile);
    profileFormMessage.textContent = navigator.onLine
      ? `${profile.name} profile saved locally. Syncing to server...`
      : `${profile.name} profile saved offline and will sync automatically.`;
    if(navigator.onLine){
      syncPendingProfiles()
        .then(result=>{
          const syncError = result?.error || lastProfileSyncError;
          profileFormMessage.textContent = pendingCount()
            ? `${profile.name} profile saved locally. ${pendingCount()} profile${pendingCount() === 1 ? "" : "s"} waiting to sync.${syncError ? ` Server says: ${syncError}` : ""}`
            : `${profile.name} profile saved.`;
          updateSyncStatus(pendingCount() ? "Saved personnel profiles shown." : "All personnel profiles synced.");
        })
        .catch(()=>{});
    }
  }finally{
    saveProfileButton.disabled = false;
    saveProfileButton.textContent = "Save Profile";
    updateSyncStatus("Saved personnel profiles shown.");
  }
});

["change","blur"].forEach(eventName=>{
  personnelName.addEventListener(eventName,()=>{
    setPersonnelProfileName(personnelName.value);
    profileFormMessage.textContent = personnelName.value
      ? `${personnelName.value} saved data shown.`
      : "";
  });
});

teacherPhotoInput?.addEventListener("change",()=>{
  const file = teacherPhotoInput.files?.[0];
  if(!file){
    teacherPhotoImage = null;
    renderTeacherPhotoFrame();
    return;
  }
  const reader = new FileReader();
  reader.onload = ()=>{
    const dataUrl = String(reader.result || "");
    loadImage(dataUrl)
      .then(image=>{
        teacherPhotoImage = image;
        currentPhotoDataUrl = dataUrl;
        if(selectedPersonnelName()){
          const profile = currentProfileForName(selectedPersonnelName());
          upsertLocalProfile({ ...profile, photoDataUrl:dataUrl, updatedAt:new Date().toISOString() });
        }
        renderTeacherPhotoFrame();
      })
      .catch(()=>{
        teacherPhotoImage = null;
        renderTeacherPhotoFrame();
      });
  };
  reader.readAsDataURL(file);
});

window.addEventListener("online",async ()=>{
  updateSyncStatus("Connection restored. Syncing personnel profiles...");
  await syncPendingProfiles();
  await loadProfiles();
});
window.addEventListener("offline",()=>updateSyncStatus("Offline mode: changes stay on this device."));
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState === "visible"){
    syncPendingProfiles().then(loadProfiles).catch(()=>{});
  }
});

document.querySelectorAll("[data-teacher-logout]").forEach(button=>{
  button.addEventListener("click", event=>{
    event.preventDefault();
    window.LearnerOffline?.clearOfflineSession?.();
    sessionStorage.removeItem("bakhawDataPrivacyNoticeAgreed");
    if(navigator.onLine){
      fetch("/api/teacher-logout", { method:"POST", keepalive:true }).catch(()=>{});
    }
    window.location.replace("/login");
  });
});

clearLegacyPhotoCache();
LearnerOffline.registerServiceWorker().catch(()=>{});
if(window.teacherEntryAllowed !== false){
  loadImage("/bakhaw-school-logo.png")
    .then(image=>{
      schoolLogoImage = image;
      renderTeacherPhotoFrame();
    })
    .catch(()=>renderTeacherPhotoFrame());
  renderProfileFields();
  if(requestedPersonnelName()){
    setPersonnelProfileName(requestedPersonnelName());
  }
  loadTeacherDirectory();
  loadGradeSections();
  loadPersonnelSource();
  loadCurrentTeacher();
  loadProfiles();
}
