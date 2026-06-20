const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const publicDir = path.join(root, "public");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : root;
const databaseUrl = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL || "";
const dataNamespace = String(process.env.DATA_NAMESPACE || "").trim();
const teacherProfileHome = process.env.TEACHER_PROFILE_HOME === "true";
const isProduction = process.env.NODE_ENV === "production";
const menuPath = resolveAdminProductsPath();
const ordersPath = path.resolve(process.env.ORDERS_PATH || path.join(dataDir, "orders.json"));
const ordersWatermarkPath = path.resolve(process.env.ORDERS_WATERMARK_PATH || path.join(dataDir, "orders-watermark.json"));
const transactionLedgerPath = path.resolve(process.env.TRANSACTION_LEDGER_PATH || path.join(dataDir, "transaction-ledger.json"));
const expensesPath = path.resolve(process.env.EXPENSES_PATH || path.join(dataDir, "expenses.json"));
const kioskSettingsPath = path.resolve(process.env.KIOSK_SETTINGS_PATH || path.join(dataDir, "kiosk-settings.json"));
const studentsPath = path.resolve(process.env.STUDENTS_PATH || path.join(dataDir, "students.json"));
const teacherAccountsPath = path.resolve(process.env.TEACHER_ACCOUNTS_PATH || path.join(dataDir, "teacher-accounts.json"));
const guidanceCasesPath = path.resolve(process.env.GUIDANCE_CASES_PATH || path.join(dataDir, "guidance-cases.json"));
const personnelProfilesPath = path.resolve(process.env.PERSONNEL_PROFILES_PATH || path.join(dataDir, "personnel-profiles.json"));
const studentsImportPath = path.join(root, "students-import.csv");
const port = Number(process.env.PORT) || 3001;
const semaphoreApiKey = process.env.SEMAPHORE_API_KEY || "";
const semaphoreSenderName = process.env.SEMAPHORE_SENDER_NAME || "";
const teacherUsername = String(process.env.TEACHER_USERNAME || "alexander.moreno").trim().toLowerCase();
const teacherPin = String(process.env.TEACHER_PIN || "1111").trim();
const teacherAdminPassword = String(process.env.TEACHER_ADMIN_PASSWORD || "1111").trim();
const guidanceAdminUsername = "alexander.moreno";
const guidanceAdminPin = "1111";
const teacherSessionSecret = process.env.TEACHER_SESSION_SECRET || crypto.createHash("sha256")
  .update(`${teacherUsername}:${teacherPin}:bakhaw-learner-portal`)
  .digest("hex");
const teacherSessionCookie = "bakhawTeacherSession";
const teacherDefaultPin = "1234";
const teacherDefaultPinVersion = "20260613-all-directory-teachers";
const teacherDirectoryCsvUrl = "https://docs.google.com/spreadsheets/d/1llV9k9pReCpe7HAYt2-vZjlqMYXDmlQixgifcfRPOy0/export?format=csv&gid=785227885";
const teacherDirectoryFetchTimeoutMs = 2500;
const personnelProfileCsvUrl = "https://docs.google.com/spreadsheets/d/1llV9k9pReCpe7HAYt2-vZjlqMYXDmlQixgifcfRPOy0/export?format=csv&gid=331359598";
const studentSheetSyncUrl = String(process.env.STUDENT_SHEET_SYNC_URL || "").trim();
const studentSheetSyncSecret = String(process.env.STUDENT_SHEET_SYNC_SECRET || "").trim();
const teacherDirectoryFallback = [
  "ALEXANDER S. MORENO", "ANALYN L. PORRAS", "BENITA T. LIZADA", "CHARLEY A. EMPESTAN",
  "CRISTY R. DENIEGA", "DARLYN JOY C. HERRERA", "EDEN P. BARCEBAS", "GELINE JR. L. ARELLANO",
  "GINA M. MUYUELA", "GIRLY G. ALBUYA", "GRACE C. NISMAL", "JANICE G. REMANDABAN",
  "JOAN S. QUITOS", "JONA T. TABALDO", "JOSE JOSEPH RICAPLAZA DE LA FUENTE", "JOSIE V. DEVIZA",
  "NOE V. BALAJIDIONG JR.", "JULIE ANN T. VASQUEZ", "JYLEN P. ADUANA", "LORENCE A. TAGACAY",
  "LORRAINE GRACE S. PETROLA", "LOVELLA S. FUENTES", "MA. DIVINA G. ANDRES", "MARIA KARMILA S. FAYO",
  "MARVY P. BONDAD", "MONALISA G. LEBUNA", "ROSELYN D. SANTILLAN", "ROXAN C. FIGUEROA",
  "SANDRA M. DIONIO", "SHANE DAVE C. ALMELDA", "SHANE F. NATONTON", "ZARAH C. CAPINIG",
  "ANGEL HELLARES ZAFRA", "RISHELLE G. HURTADA", "CJ D. CORTEZ", "MARIDEL N. ONATO"
];
const menuContractVersion = "20260518-admin-canonical-menu";
const allowEmptyOrderStorage = process.env.ALLOW_EMPTY_ORDER_STORAGE === "true";
let cachedMenu = null;
let cachedMenuMtime = 0;
const cachedImages = new Map();
let menuFileReady = null;
let ordersFileReady = null;
let dbPool = null;
let dbReady = null;
let studentSeedPromise = null;
let teacherDirectoryCache = null;
let teacherDirectoryCachedAt = 0;
let personnelProfileCache = null;
let personnelProfileCachedAt = 0;
let personnelProfileFieldCache = null;
let personnelProfileFieldCachedAt = 0;
let gradeSectionCache = null;
let advisoryDirectoryCache = null;
const legacyMenuPaths = [...new Set([
  path.join(root, "menu.json"),
  path.join(dataDir, "menu.json"),
  process.env.ADMIN_PRODUCTS_PATH ? path.resolve(process.env.ADMIN_PRODUCTS_PATH) : ""
])].filter(filePath=>filePath && path.resolve(filePath) !== menuPath);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png"
};

function requestPath(req){
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

function resolveAdminProductsPath(){
  const canonicalPath = path.join(dataDir, "admin-products.json");
  const configuredPath = process.env.ADMIN_PRODUCTS_PATH
    ? path.resolve(process.env.ADMIN_PRODUCTS_PATH)
    : canonicalPath;

  if(isProduction || path.basename(configuredPath).toLowerCase() === "menu.json"){
    return canonicalPath;
  }

  return configuredPath;
}

function send(res, status, body, type = "application/json; charset=utf-8", extraHeaders = {}){
  const cacheControl = type.includes("application/json")
    ? "no-store"
    : type.includes("text/html")
      ? "no-store, max-age=0, must-revalidate"
      : type.includes("application/javascript") || type.includes("text/css")
        ? "no-cache, max-age=0, must-revalidate"
        : "public, max-age=86400";

  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": cacheControl,
    ...extraHeaders
  });
  res.end(body);
}

function sendRedirect(res, location){
  res.writeHead(302, {
    "Location":location,
    "Cache-Control":"no-store"
  });
  res.end();
}

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function guidanceCaseRegisterHtml(cases){
  const savedCases = Array.isArray(cases) ? cases : [];
  const status = `${savedCases.length} of ${savedCases.length} guidance case${savedCases.length === 1 ? "" : "s"}`;
  const cards = savedCases.length ? savedCases.map(item=>`
        <article class="case-card">
          <div class="case-card-head"><h3>${escapeHtml(item.caseNumber)}</h3></div>
          <p class="case-learner-name"><strong>${escapeHtml(item.primaryStudent?.name)}</strong></p>
          <div class="case-card-actions">
            <button class="report" type="button" data-action="report" data-id="${escapeHtml(item.id)}">Report</button>
            <button type="button" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
            <button class="danger" type="button" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>
          </div>
        </article>`).join("") : `<div class="profile-card empty">No guidance cases match.</div>`;

  return {
    statusHtml:`<p id="caseStatusMessage" role="status">${escapeHtml(status)}</p>`,
    listHtml:`<div id="caseList" class="case-list">${cards}</div>`
  };
}

function parseCookies(req){
  return String(req.headers.cookie || "")
    .split(";")
    .map(part=>part.trim())
    .filter(Boolean)
    .reduce((cookies, part)=>{
      const separator = part.indexOf("=");

      if(separator > 0){
        cookies[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
      }

      return cookies;
    }, {});
}

function teacherSessionToken(
  account,
  privacyAccepted = false,
  adminUnlocked = account.adminUnlocked === true,
  guidanceAccess = account.guidanceAccess === true
){
  const expiresAt = Date.now() + (12 * 60 * 60 * 1000);
  const payload = Buffer.from(JSON.stringify({
    username:account.username,
    displayName:account.displayName,
    role:account.role,
    expiresAt,
    privacyAccepted,
    adminUnlocked,
    guidanceAccess
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", teacherSessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readTeacherSession(req){
  const token = parseCookies(req)[teacherSessionCookie] || "";
  const [payload, signature] = token.split(".");

  if(!payload || !signature){
    return null;
  }

  const expected = crypto.createHmac("sha256", teacherSessionSecret).update(payload).digest();
  let supplied;

  try{
    supplied = Buffer.from(signature, "base64url");
  }catch{
    return null;
  }

  if(supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)){
    return null;
  }

  try{
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.username && Number(session.expiresAt) > Date.now() ? session : null;
  }catch{
    return null;
  }
}

function validTeacherSession(req){
  return readTeacherSession(req)?.privacyAccepted === true;
}

function validGuidanceSession(req){
  const session = readTeacherSession(req);
  return session?.privacyAccepted === true
    && session.username === guidanceAdminUsername
    && session.role === "admin"
    && session.guidanceAccess === true;
}

function teacherCookie(token, maxAge = null){
  const secure = isProduction ? "; Secure" : "";
  const lifetime = maxAge === null ? "" : `; Max-Age=${maxAge}`;
  return `${teacherSessionCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${lifetime}${secure}`;
}

function safeCredentialEqual(received, expected){
  const receivedHash = crypto.createHash("sha256").update(String(received || "")).digest();
  const expectedHash = crypto.createHash("sha256").update(String(expected || "")).digest();
  return crypto.timingSafeEqual(receivedHash, expectedHash);
}

function isDatabaseConnectionError(error){
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(code)
    || /getaddrinfo|database connection|connection terminated|timeout|cannot find module 'pg'/i.test(message);
}

function publicErrorMessage(error){
  if(isDatabaseConnectionError(error)){
    return "Database connection is temporarily unavailable. Try again, or use offline login on this device if it was already set up.";
  }
  return error?.message || "The request could not be completed.";
}

function wait(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

async function withDatabaseRetry(action, attempts = 3){
  let lastError;
  for(let attempt = 0; attempt < attempts; attempt += 1){
    try{
      return await action();
    }catch(error){
      lastError = error;
      if(!isDatabaseConnectionError(error) || attempt === attempts - 1){
        throw error;
      }
      dbReady = null;
      dbPool = null;
      await wait(200 * (attempt + 1));
    }
  }
  throw lastError;
}

function normalizedTeacherUsername(value){
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "");
}

function teacherUsernameFromName(name){
  const words = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .split(/\s+/)
    .map(word=>word.replace(/\./g, ""))
    .filter(Boolean);
  const suffixes = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
  while(words.length && suffixes.has(words[words.length - 1])){
    words.pop();
  }
  return normalizedTeacherUsername(`${words[0] || ""}.${words[words.length - 1] || ""}`);
}

function teacherDirectoryEntries(names){
  return [...new Set(names.map(name=>String(name || "").trim()).filter(Boolean))]
    .map(displayName=>({
      displayName,
      username:teacherUsernameFromName(displayName)
    }))
    .filter(entry=>entry.username.includes("."));
}

async function readTeacherDirectory(forceRefresh = false){
  if(!forceRefresh && teacherDirectoryCache && Date.now() - teacherDirectoryCachedAt < 15 * 60 * 1000){
    return teacherDirectoryCache;
  }

  try{
    const response = await fetch(teacherDirectoryCsvUrl, { signal:AbortSignal.timeout(teacherDirectoryFetchTimeoutMs) });
    if(!response.ok){
      throw new Error(`Google Sheet returned ${response.status}.`);
    }
    const rows = parseCsvRows(await response.text());
    const names = rows.slice(1).map(row=>String(row[9] || "").trim()).filter(Boolean);
    if(!names.length){
      throw new Error("Column J did not contain teacher names.");
    }
    teacherDirectoryCache = teacherDirectoryEntries(names);
  }catch{
    if(!teacherDirectoryCache){
      teacherDirectoryCache = teacherDirectoryEntries(teacherDirectoryFallback);
    }
  }

  teacherDirectoryCachedAt = Date.now();
  return teacherDirectoryCache;
}

async function readGradeSections(){
  try{
    const response = await fetch(teacherDirectoryCsvUrl, { signal:AbortSignal.timeout(10000) });
    if(!response.ok){
      throw new Error(`Google Sheet returned ${response.status}.`);
    }
    const rows = parseCsvRows(await response.text());
    const sections = rows.slice(1)
      .map(row=>String(row[14] || "").trim())
      .filter(Boolean);
    if(!sections.length){
      throw new Error("Column O did not contain grade and section names.");
    }
    gradeSectionCache = [...new Set(sections)]
      .sort((a, b)=>a.localeCompare(b, undefined, { numeric:true }));
  }catch{
    if(!gradeSectionCache){
      gradeSectionCache = [];
    }
  }

  return gradeSectionCache;
}

async function readAdvisoryDirectory(){
  try{
    const response = await fetch(teacherDirectoryCsvUrl, { signal:AbortSignal.timeout(10000) });
    if(!response.ok){
      throw new Error(`Google Sheet returned ${response.status}.`);
    }
    const rows = parseCsvRows(await response.text());
    const advisories = rows.slice(1)
      .map(row=>({
        teacher:String(row[10] || "").trim(),
        department:String(row[11] || "").trim(),
        gradeSection:String(row[14] || "").trim()
      }))
      .filter(entry=>entry.teacher && entry.gradeSection);
    if(!advisories.length){
      throw new Error("Columns K, L, and O did not contain advisory assignments.");
    }
    advisoryDirectoryCache = advisories;
  }catch{
    if(!advisoryDirectoryCache){
      advisoryDirectoryCache = [];
    }
  }

  return advisoryDirectoryCache;
}

async function readPersonnelProfiles(forceRefresh = false){
  if(!forceRefresh && personnelProfileCache && Date.now() - personnelProfileCachedAt < 15 * 60 * 1000){
    return personnelProfileCache;
  }

  const teachers = await readTeacherDirectory(forceRefresh);
  personnelProfileCache = teachers.map((teacher,index)=>({
    id:`personnel-${index + 1}`,
    name:teacher.displayName
  }));
  personnelProfileCachedAt = Date.now();
  return personnelProfileCache;
}

function personnelFieldId(label){
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isPersonnelDateField(fieldKey){
  return fieldKey === "birthday" || String(fieldKey || "").includes("date");
}

function formatPersonnelDate(value){
  const cleanValue = String(value || "").trim();
  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(isoMatch){
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }
  const slashMatch = cleanValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if(slashMatch){
    const year = slashMatch[3].length === 2 ? `19${slashMatch[3]}` : slashMatch[3];
    return `${slashMatch[1].padStart(2, "0")}/${slashMatch[2].padStart(2, "0")}/${year}`;
  }
  return cleanValue;
}

function defaultPersonnelProfileFields(){
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
  ].map((label,index)=>({
    id:personnelFieldId(label) || `field-${index + 1}`,
    label,
    options:[]
  }));
}

async function readPersonnelProfileFields(forceRefresh = false){
  if(!forceRefresh && personnelProfileFieldCache && Date.now() - personnelProfileFieldCachedAt < 15 * 60 * 1000){
    return personnelProfileFieldCache;
  }

  try{
    const response = await fetch(personnelProfileCsvUrl, { signal:AbortSignal.timeout(10000) });
    if(!response.ok){
      throw new Error(`Google Sheet returned ${response.status}.`);
    }
    const rows = parseCsvRows(await response.text());
    const labels = rows
      .map(row=>String(row[0] || "").trim())
      .filter(Boolean)
      .filter((label,index)=>index > 0 || !/^(field|fields|title|box title|profile field)$/i.test(label));
    const columnBOptions = [...new Map(rows
      .flatMap(row=>personnelFieldOptions(row[1]))
      .filter(option=>!/^(option|options|choice|choices|department)$/i.test(option))
      .map(option=>[option.toLowerCase(), option])).values()];
    if(!labels.length){
      throw new Error("Profile sheet Column A did not contain profile field titles.");
    }
    const uniqueFields = new Map();
    labels.forEach((label,index)=>{
      const id = personnelFieldId(label) || `field-${index + 1}`;
      if(!uniqueFields.has(id)){
        uniqueFields.set(id, {
          id,
          label,
          options:id === "department" ? columnBOptions : []
        });
      }
    });
    personnelProfileFieldCache = [...uniqueFields.values()].filter(field=>field.label && field.id !== "name");
  }catch{
    if(!personnelProfileFieldCache){
      personnelProfileFieldCache = defaultPersonnelProfileFields();
    }
  }

  personnelProfileFieldCachedAt = Date.now();
  return personnelProfileFieldCache;
}

function personnelFieldOptions(value){
  return String(value || "")
    .split(/[\r\n;|,]+/)
    .flatMap(part=>part.split(","))
    .map(option=>option.trim())
    .filter(Boolean);
}

function teacherPinHash(pin, salt){
  return crypto.pbkdf2Sync(String(pin), salt, 120000, 32, "sha256").toString("hex");
}

function createTeacherAccount({ username, displayName, pin, role = "teacher", active = true }){
  const cleanUsername = normalizedTeacherUsername(username);
  const salt = crypto.randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  return {
    username:cleanUsername,
    displayName:String(displayName || cleanUsername).trim(),
    role:role === "admin" ? "admin" : "teacher",
    active:active !== false,
    pinSalt:salt,
    pinHash:teacherPinHash(pin, salt),
    createdAt:now,
    updatedAt:now
  };
}

function publicTeacherAccount(account){
  return {
    username:account.username,
    displayName:account.displayName,
    role:account.role,
    active:account.active !== false,
    createdAt:account.createdAt,
    updatedAt:account.updatedAt
  };
}

async function readTeacherAccounts(){
  const seed = [createTeacherAccount({
    username:teacherUsername,
    displayName:"Alexander Moreno",
    pin:teacherPin,
    role:"admin"
  })];
  const accounts = await readDataRecord("teacher-accounts", teacherAccountsPath, seed);

  if(!Array.isArray(accounts)){
    throw new Error("Teacher account storage is not an array.");
  }

  let normalized = accounts.filter(account=>account && account.username && account.pinSalt && account.pinHash)
    .map(account=>({
      ...account,
      username:normalizedTeacherUsername(account.username),
      displayName:String(account.displayName || account.username).trim(),
      role:account.role === "admin" ? "admin" : "teacher",
      active:account.active !== false
    }));

  if(!normalized.some(account=>account.username === teacherUsername)){
    normalized = [...seed, ...normalized];
  }

  const directory = await readTeacherDirectory();
  let changed = false;

  for(const teacher of directory){
    const index = normalized.findIndex(account=>account.username === teacher.username);

    if(index < 0){
      normalized.push({
        ...createTeacherAccount({
          username:teacher.username,
          displayName:teacher.displayName,
          pin:teacherDefaultPin,
          role:teacher.username === teacherUsername ? "admin" : "teacher"
        }),
        defaultPinVersion:teacherDefaultPinVersion
      });
      changed = true;
      continue;
    }

    const account = normalized[index];
    if(account.defaultPinVersion !== teacherDefaultPinVersion){
      const salt = crypto.randomBytes(16).toString("hex");
      normalized[index] = {
        ...account,
        displayName:teacher.displayName,
        role:teacher.username === teacherUsername ? "admin" : account.role,
        active:true,
        pinSalt:salt,
        pinHash:teacherPinHash(teacherDefaultPin, salt),
        defaultPinVersion:teacherDefaultPinVersion,
        updatedAt:new Date().toISOString()
      };
      changed = true;
    }
  }

  if(changed){
    try{
      await writeTeacherAccounts(normalized);
    }catch(error){
      if(!isDatabaseConnectionError(error)){
        throw error;
      }
      console.warn(`Teacher account defaults could not be persisted; continuing with in-memory defaults. ${error.message}`);
    }
  }

  return normalized;
}

async function writeTeacherAccounts(accounts){
  await writeDataRecord("teacher-accounts", teacherAccountsPath, accounts);
}

function validTeacherPin(pin, account){
  return safeCredentialEqual(teacherPinHash(pin, account.pinSalt), account.pinHash);
}

function requireTeacherAdmin(req, res){
  const session = readTeacherSession(req);
  if(!session || !session.privacyAccepted || session.role !== "admin" || !session.adminUnlocked){
    send(res, 403, JSON.stringify({ ok:false, message:"Teacher Accounts password required." }));
    return null;
  }
  return session;
}

async function readBody(req){
  const chunks = [];
  for await (const chunk of req){
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readOrders(){
  const orders = await readDataRecord("orders", ordersPath, []);

  if(!Array.isArray(orders)){
    throw new Error("Orders storage is not an array. Write blocked to protect records.");
  }

  const watermark = await readOrderWatermark();

  if(watermark > orders.length){
    throw new Error("Order storage appears truncated. Refusing to serve incomplete transaction history.");
  }

  return orders;
}

async function writeOrders(orders){
  if(!Array.isArray(orders)){
    throw new Error("Orders write blocked: invalid order data.");
  }

  await writeOrdersRecord(orders);
}

async function getDbPool(){
  if(!databaseUrl){
    return null;
  }

  if(!dbPool){
    const { Pool } = require("pg");
    dbPool = new Pool({
      connectionString:databaseUrl,
      ssl: databaseUrl.includes("localhost") || databaseUrl.includes("127.0.0.1") ? false : { rejectUnauthorized:false }
    });
  }

  if(!dbReady){
    dbReady = dbPool.query(`
      create table if not exists app_data (
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);
  }

  await dbReady;
  return dbPool;
}

async function readDataRecord(key, filePath, fallbackValue){
  try{
    const result = await withDatabaseRetry(async ()=>{
      const pool = await getDbPool();

      if(!pool){
        return { usingDatabase:false };
      }
      const dbKey = storageKey(key);
      const existing = await pool.query("select value from app_data where key = $1", [dbKey]);

      if(existing.rows.length){
        return { usingDatabase:true, value:existing.rows[0].value };
      }

      const seed = await readJsonSeed(filePath, fallbackValue);
      await pool.query(
        "insert into app_data (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do nothing",
        [dbKey, JSON.stringify(seed)]
      );
      return { usingDatabase:true, value:seed };
    });

    if(result.usingDatabase){
      return result.value;
    }
  }catch(error){
    if(!isDatabaseConnectionError(error)){
      throw error;
    }
    dbReady = null;
    dbPool = null;
    if(key === "guidance-cases"){
      throw error;
    }
    console.warn(`Database unavailable while reading ${key}; using fallback data. ${error.message}`);
    return readJsonSeed(filePath, fallbackValue);
  }

  requirePersistentStorageForProduction(key, "read");

  await ensureJsonFile(filePath, null, fallbackValue);

  try{
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  }catch(error){
    throw new Error(`${path.basename(filePath)} could not be read safely: ${error.message}`);
  }
}

async function writeOrdersRecord(nextOrders){
  const currentOrders = await readDataRecord("orders", ordersPath, []);

  if(!Array.isArray(currentOrders)){
    throw new Error("Orders write blocked: current storage is not an array.");
  }

  const watermark = await readOrderWatermark();

  if(nextOrders.length < Math.max(currentOrders.length, watermark)){
    throw new Error("Orders write blocked: refusing to shrink transaction history.");
  }

  const nextIds = new Set(nextOrders.map(order=>String(order.id || "")));
  const missingExistingOrder = currentOrders.some(order=>order.id && !nextIds.has(String(order.id)));

  if(missingExistingOrder){
    throw new Error("Orders write blocked: refusing to drop existing transaction IDs.");
  }

  await writeDataRecord("orders", ordersPath, nextOrders);
  await writeOrderWatermark(Math.max(watermark, nextOrders.length));
}

async function readOrderWatermark(){
  const value = await readDataRecord("orders-watermark", ordersWatermarkPath, 0);
  return Math.max(0, Number(value) || 0);
}

async function writeOrderWatermark(value){
  await writeDataRecord("orders-watermark", ordersWatermarkPath, Math.max(0, Number(value) || 0));
}

async function readTransactionLines(){
  const lines = await readDataRecord("transaction-ledger", transactionLedgerPath, []);

  if(!Array.isArray(lines)){
    throw new Error("Transaction ledger is not an array. Refusing to serve incomplete records.");
  }

  return lines;
}

async function readReportingTransactionLines(){
  const lines = await readTransactionLines();

  if(lines.length){
    return lines;
  }

  return ordersToTransactionLines(await readOrders());
}

async function readExpenses(){
  const expenses = await readDataRecord("expenses", expensesPath, []);

  if(!Array.isArray(expenses)){
    throw new Error("Expenses storage is not an array. Refusing to serve incomplete records.");
  }

  return expenses.map(normalizeExpense).filter(Boolean);
}

async function readKioskSettings(){
  return normalizeKioskSettings(await readDataRecord("kiosk-settings", kioskSettingsPath, defaultKioskSettings()));
}

async function readStudents(){
  const seed = await readStudentSeed();
  const students = await readDataRecord("students", studentsPath, seed);

  if(!Array.isArray(students)){
    throw new Error("Student storage is not an array.");
  }

  return students.map(normalizeStudent).filter(Boolean);
}

async function writeStudents(students){
  if(!Array.isArray(students)){
    throw new Error("Student write blocked: invalid record data.");
  }

  await writeDataRecord("students", studentsPath, students.map(normalizeStudent).filter(Boolean));
}

async function readGuidanceCases(){
  const cases = await readDataRecord("guidance-cases", guidanceCasesPath, []);
  if(!Array.isArray(cases)){
    throw new Error("Guidance case storage is not an array.");
  }
  return cases;
}

async function writeGuidanceCases(cases){
  if(!Array.isArray(cases)){
    throw new Error("Guidance case write blocked: invalid case data.");
  }
  await writeDataRecord("guidance-cases", guidanceCasesPath, cases);
}

async function readPersonnelProfileRecords(){
  const profiles = await readDataRecord("personnel-profiles", personnelProfilesPath, []);
  if(!Array.isArray(profiles)){
    throw new Error("Personnel profile storage is not an array.");
  }
  return profiles.map(normalizePersonnelProfile).filter(profile=>profile.name);
}

async function writePersonnelProfileRecords(profiles){
  if(!Array.isArray(profiles)){
    throw new Error("Personnel profile write blocked: invalid profile data.");
  }
  await writeDataRecord("personnel-profiles", personnelProfilesPath, profiles.map(normalizePersonnelProfile).filter(profile=>profile.name));
}

function normalizePersonnelProfile(profile = {}){
  const name = String(profile.name || "").trim().replace(/\s+/g, " ");
  const sex = String(profile.sex || "").trim();
  const photoDataUrl = normalizePersonnelPhotoDataUrl(profile.photoDataUrl || profile.photo || profile.image || "");
  const fields = {};
  if(profile.fields && typeof profile.fields === "object" && !Array.isArray(profile.fields)){
    Object.entries(profile.fields).forEach(([key,value])=>{
      const fieldKey = personnelFieldId(key);
      if(fieldKey){
        fields[fieldKey] = isPersonnelDateField(fieldKey) ? formatPersonnelDate(value) : String(value || "").trim();
      }
    });
  }
  const legacyFields = {
    sex,
    birthday:formatPersonnelDate(profile.birthday),
    position:String(profile.position || "").trim(),
    department:String(profile.department || "").trim(),
    "advisory-assignment":String(profile.advisory || "").trim(),
    "contact-number":String(profile.contactNumber || "").trim(),
    "deped-email":String(profile.depedEmail || "").trim().toLowerCase(),
    address:String(profile.address || "").trim(),
    "emergency-contact":String(profile.emergencyContact || "").trim(),
    "employee-no":String(profile.employeeNumber || "").trim(),
    gsis:String(profile.gsis || "").trim(),
    philhealth:String(profile.philHealth || "").trim(),
    tin:String(profile.tin || "").trim(),
    "pag-ibig":String(profile.pagibig || "").trim(),
    "prc-license-no":String(profile.prcLicense || "").trim(),
    notes:String(profile.notes || "").trim()
  };
  Object.entries(legacyFields).forEach(([key,value])=>{
    if(value && !fields[key]){
      fields[key] = value;
    }
  });
  return {
    id:String(profile.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || crypto.randomUUID()).replace(/^-+|-+$/g, ""),
    name,
    sex:["Male","Female"].includes(sex) ? sex : "",
    birthday:formatPersonnelDate(profile.birthday),
    position:String(profile.position || "").trim(),
    department:String(profile.department || "").trim(),
    advisory:String(profile.advisory || "").trim(),
    contactNumber:String(profile.contactNumber || "").trim(),
    depedEmail:String(profile.depedEmail || "").trim().toLowerCase(),
    address:String(profile.address || "").trim(),
    emergencyContact:String(profile.emergencyContact || "").trim(),
    employeeNumber:String(profile.employeeNumber || "").trim(),
    gsis:String(profile.gsis || "").trim(),
    philHealth:String(profile.philHealth || "").trim(),
    tin:String(profile.tin || "").trim(),
    pagibig:String(profile.pagibig || "").trim(),
    prcLicense:String(profile.prcLicense || "").trim(),
    notes:String(profile.notes || "").trim(),
    photoDataUrl,
    fields,
    updatedAt:String(profile.updatedAt || new Date().toISOString())
  };
}

function normalizePersonnelPhotoDataUrl(value){
  const photo = String(value || "").trim();
  if(!photo || photo.length > 2500000){
    return "";
  }
  return /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(photo) ? photo : "";
}

function mergePersonnelProfileData(existingProfile = {}, incomingProfile = {}){
  const existing = normalizePersonnelProfile(existingProfile);
  const incoming = normalizePersonnelProfile(incomingProfile);
  const mergedFields = { ...(existing.fields || {}) };
  Object.entries(incoming.fields || {}).forEach(([key,value])=>{
    if(String(value || "").trim()){
      mergedFields[key] = value;
    }else if(!(key in mergedFields)){
      mergedFields[key] = "";
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
  merged.fields = mergedFields;
  merged.updatedAt = incoming.updatedAt || new Date().toISOString();
  return normalizePersonnelProfile(merged);
}

function personnelNameTokens(name){
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function meaningfulPersonnelNameTokens(name){
  return personnelNameTokens(name).filter(token=>token.length > 1 && !["jr", "sr", "ii", "iii", "iv"].includes(token));
}

function samePersonnelName(leftName, rightName){
  const left = personnelNameTokens(leftName);
  const right = personnelNameTokens(rightName);
  if(!left.length || !right.length){
    return false;
  }
  if(left.join(" ") === right.join(" ")){
    return true;
  }
  const leftMeaningful = meaningfulPersonnelNameTokens(leftName);
  const rightMeaningful = meaningfulPersonnelNameTokens(rightName);
  const smaller = leftMeaningful.length <= rightMeaningful.length ? leftMeaningful : rightMeaningful;
  const larger = leftMeaningful.length > rightMeaningful.length ? leftMeaningful : rightMeaningful;
  return smaller.length >= 2 && smaller.every(token=>larger.includes(token));
}

function guidanceStudentName(student){
  const given = [student.firstName, student.middleName, student.extension].filter(Boolean).join(" ");
  return [student.familyName, given].filter(Boolean).join(", ");
}

function guidanceStudentSnapshot(student){
  return {
    id:student.id,
    name:guidanceStudentName(student),
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

function guidanceDepartment(gradeSection){
  const grade = Number(String(gradeSection || "").match(/^\d+/)?.[0]);
  return grade >= 7 && grade <= 10 ? "JHS" : "Elementary";
}

function nextGuidanceCaseNumber(cases, date){
  const year = String(date || localOrderDate()).slice(0, 4);
  const pattern = new RegExp(`^GDC-${year}-(\\d+)$`);
  const sequence = cases.reduce((highest, item)=>{
    const match = String(item.caseNumber || "").match(pattern);
    return match ? Math.max(highest, Number(match[1]) || 0) : highest;
  }, 0) + 1;
  return `GDC-${year}-${String(sequence).padStart(4, "0")}`;
}

async function buildGuidanceCase(body, existingCase = null, session = null){
  const students = await readStudents();
  const studentById = new Map(students.map(student=>[student.id, student]));
  const primaryStudent = studentById.get(String(body.primaryStudentId || ""));
  if(!primaryStudent){
    throw new Error("Select the learner whose case profile will be opened.");
  }

  const seen = new Set();
  const involved = (Array.isArray(body.involved) ? body.involved : [])
    .map(item=>({
      student:studentById.get(String(item.studentId || "")),
      role:String(item.role || "").trim(),
      notes:String(item.notes || "").trim()
    }))
    .filter(item=>item.student && item.student.id !== primaryStudent.id)
    .filter(item=>{
      if(seen.has(item.student.id)){
        return false;
      }
      seen.add(item.student.id);
      return true;
    });

  const participants = [primaryStudent, ...involved.map(item=>item.student)];
  const hasJhsLearner = participants.some(student=>guidanceDepartment(student.gradeSection) === "JHS");
  const advisories = await readAdvisoryDirectory();
  const advisoryBySection = new Map(advisories.map(item=>[item.gradeSection, item]));
  const advisers = [...new Map(participants.map(student=>{
    const advisory = advisoryBySection.get(student.gradeSection);
    return [student.gradeSection, {
      gradeSection:student.gradeSection,
      teacher:advisory?.teacher || "Adviser not assigned",
      department:advisory?.department || guidanceDepartment(student.gradeSection)
    }];
  })).values()];

  const reportDate = String(body.reportDate || localOrderDate()).trim();
  const incidentDate = String(body.incidentDate || "").trim();
  const incidentLocation = String(body.incidentLocation || "").trim();
  const aggressionType = String(body.aggressionType || "").trim();
  const immediateResponse = String(body.immediateResponse || "").trim();
  const referredTo = String(body.referredTo || "").trim();
  const intervention = String(body.intervention || "").trim();
  if(!incidentDate || !incidentLocation || !aggressionType || !immediateResponse || !referredTo || !intervention){
    throw new Error("Complete the incident location, response, referral, and recommended intervention.");
  }

  const now = new Date().toISOString();
  return {
    id:existingCase?.id || crypto.randomUUID(),
    caseNumber:existingCase?.caseNumber || "",
    reportDate,
    incidentDate,
    incidentTime:String(body.incidentTime || "").trim(),
    incidentLocation,
    primaryStudent:guidanceStudentSnapshot(primaryStudent),
    primaryRole:String(body.primaryRole || "Victim").trim(),
    involved:involved.map(item=>({
      student:guidanceStudentSnapshot(item.student),
      role:item.role || "Witness",
      notes:item.notes
    })),
    aggressionType,
    aggressionDetails:String(body.aggressionDetails || "").trim(),
    immediateResponse,
    referredTo,
    intervention,
    interventionDetails:String(body.interventionDetails || "").trim(),
    advisers,
    adviserInformed:body.adviserInformed === true,
    adviserInformedAt:body.adviserInformed === true
      ? String(body.adviserInformedAt || reportDate).trim()
      : "",
    status:["Open", "For Monitoring", "Resolved", "Referred"].includes(body.status)
      ? body.status
      : "Open",
    guidanceLevel:hasJhsLearner ? "JHS" : "Elementary",
    signatory:hasJhsLearner ? "Alexander S. Moreno" : "Monalisa G. Lebuna",
    createdBy:existingCase?.createdBy || session?.displayName || session?.username || "",
    createdAt:existingCase?.createdAt || now,
    updatedAt:now
  };
}

async function syncStudentToGoogleSheet(action, student, previousStudent = null){
  if(!studentSheetSyncUrl || !studentSheetSyncSecret){
    return false;
  }

  const response = await fetch(studentSheetSyncUrl, {
    method:"POST",
    headers:{ "Content-Type":"text/plain; charset=utf-8" },
    body:JSON.stringify({
      secret:studentSheetSyncSecret,
      action,
      student,
      previousStudent
    }),
    signal:AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(()=>({}));
  if(!response.ok || !result.ok){
    throw new Error(result.message || `Google Sheet sync failed with status ${response.status}.`);
  }
  return true;
}

async function readStudentSeed(){
  if(!studentSeedPromise){
    studentSeedPromise = fs.readFile(studentsImportPath, "utf8")
      .then(parseStudentCsv)
      .catch(()=>[]);
  }

  return studentSeedPromise;
}

function parseStudentCsv(csv){
  const rows = parseCsvRows(csv);
  const headerIndex = rows.findIndex(row=>row.includes("Grade/Section"));

  if(headerIndex < 0){
    return [];
  }

  const headers = rows[headerIndex];
  const column = name=>headers.indexOf(name);
  const fields = {
    gradeSection:column("Grade/Section"),
    familyName:column("Family Name"),
    firstName:column("First Name"),
    middleName:column("Middle Name"),
    extension:column("Extension"),
    sex:column("Sex"),
    age:column("Age"),
    birthday:column("Birthday"),
    statusCode:column("Status Code"),
    dateOfMovement:column("Date of Movement"),
    code3Class:column("If Code 3, which class?"),
    lrn:column("LRN"),
    address:column("Address"),
    father:column("Father"),
    mother:column("Mother"),
    guardian:column("Guardian"),
    contactNumber:column("Contact Number")
  };

  return rows.slice(headerIndex + 1)
    .map((row, index)=>{
      const student = { id:`import-${index + 1}` };
      Object.entries(fields).forEach(([key, position])=>{
        student[key] = position >= 0 ? String(row[position] || "").trim() : "";
      });
      return normalizeStudent(student);
    })
    .filter(Boolean);
}

function parseCsvRows(csv){
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for(let index = 0; index < csv.length; index += 1){
    const character = csv[index];

    if(character === '"'){
      if(quoted && csv[index + 1] === '"'){
        value += '"';
        index += 1;
      }else{
        quoted = !quoted;
      }
    }else if(character === "," && !quoted){
      row.push(value);
      value = "";
    }else if((character === "\n" || character === "\r") && !quoted){
      if(character === "\r" && csv[index + 1] === "\n"){
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    }else{
      value += character;
    }
  }

  if(value || row.length){
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function normalizeStudent(student){
  const source = student && typeof student === "object" ? student : {};
  const clean = {
    id:String(source.id || crypto.randomUUID()),
    gradeSection:String(source.gradeSection || "").trim(),
    familyName:String(source.familyName || "").trim().toUpperCase(),
    firstName:String(source.firstName || "").trim().toUpperCase(),
    middleName:String(source.middleName || "").trim().toUpperCase(),
    extension:String(source.extension || "").trim().toUpperCase(),
    sex:String(source.sex || "").trim().toUpperCase(),
    age:String(source.age || "").trim(),
    birthday:normalizeStudentDate(source.birthday),
    statusCode:String(source.statusCode || "").trim(),
    dateOfMovement:normalizeStudentDate(source.dateOfMovement),
    code3Class:String(source.code3Class || "").trim(),
    lrn:String(source.lrn || "").replace(/\D/g, ""),
    address:String(source.address || "").trim().toUpperCase(),
    father:String(source.father || "").trim().toUpperCase(),
    mother:String(source.mother || "").trim().toUpperCase(),
    guardian:String(source.guardian || "").trim().toUpperCase(),
    contactNumber:String(source.contactNumber || "").trim(),
    createdAt:source.createdAt || new Date().toISOString(),
    updatedAt:source.updatedAt || new Date().toISOString()
  };

  if(!clean.gradeSection && !clean.familyName && !clean.firstName && !clean.lrn){
    return null;
  }

  return clean;
}

function normalizeStudentDate(value){
  const text = String(value || "").trim();

  if(!text){
    return "";
  }

  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
    return text;
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if(!match){
    return text;
  }

  const month = String(Number(match[1])).padStart(2, "0");
  const day = String(Number(match[2])).padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

function duplicateStudentLrn(students, lrn, excludedId = ""){
  if(!lrn){
    return null;
  }

  return students.find(student=>student.lrn === lrn && student.id !== excludedId) || null;
}

async function writeKioskSettings(settings){
  const cleanSettings = normalizeKioskSettings(settings);
  await writeDataRecord("kiosk-settings", kioskSettingsPath, cleanSettings);
  return cleanSettings;
}

function defaultKioskSettings(){
  return {
    operatingDays:[1, 2, 3, 4, 5],
    closedDates:[]
  };
}

function normalizeKioskSettings(settings){
  const source = settings && typeof settings === "object" ? settings : {};
  const days = Array.isArray(source.operatingDays) ? source.operatingDays : defaultKioskSettings().operatingDays;
  const operatingDays = [...new Set(days
    .map(day=>Number(day))
    .filter(day=>Number.isInteger(day) && day >= 0 && day <= 6)
  )].sort((a, b)=>a - b);
  const closedDates = [...new Set((Array.isArray(source.closedDates) ? source.closedDates : [])
    .map(date=>String(date || "").trim())
    .filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date))
  )].sort();

  return {
    operatingDays:operatingDays.length ? operatingDays : defaultKioskSettings().operatingDays,
    closedDates
  };
}

function normalizeExpense(expense){
  const date = String(expense.date || localOrderDate()).trim();
  const item = String(expense.item || expense.items || "").trim();
  const amount = Math.max(0, Number(expense.amount) || 0);

  if(!item && !amount){
    return null;
  }

  return {
    id:String(expense.id || crypto.randomUUID()),
    date,
    item,
    amount,
    createdAt:expense.createdAt || new Date().toISOString()
  };
}

async function appendTransactionLinesForOrder(order){
  const lines = transactionLinesForOrder(order);

  if(!lines.length){
    return;
  }

  const existingLines = await readTransactionLines();
  const baseLines = existingLines.length ? existingLines : ordersToTransactionLines(await readOrders());
  const existingKeys = new Set(baseLines.map(line=>transactionLineKey(line)));
  const newLines = lines.filter(line=>!existingKeys.has(transactionLineKey(line)));

  if(!newLines.length){
    return;
  }

  await writeDataRecord("transaction-ledger", transactionLedgerPath, [...newLines, ...baseLines]);
}

async function backfillTransactionLedgerFromOrders(){
  const orders = await readOrders();
  const existingLines = await readTransactionLines();
  const existingKeys = new Set(existingLines.map(line=>transactionLineKey(line)));
  const backfillLines = ordersToTransactionLines(orders)
    .filter(line=>!existingKeys.has(transactionLineKey(line)));

  if(!backfillLines.length){
    return { added:0, total:existingLines.length };
  }

  const nextLines = [...backfillLines, ...existingLines];
  await writeDataRecord("transaction-ledger", transactionLedgerPath, nextLines);
  return { added:backfillLines.length, total:nextLines.length };
}

function transactionLinesForOrder(order){
  const items = Array.isArray(order.items) ? order.items : [];
  const transactionTotal = Number(order.total) || items.reduce((sum, item)=>{
    const qty = Math.max(0, Number(item.qty) || 0);
    return sum + (Number(item.subtotal) || qty * (Number(item.price) || 0));
  }, 0);
  const timestamp = order.completedAt || order.doneAt || order.createdAt || new Date().toISOString();

  return items
    .map(item=>{
      const qty = Math.max(0, Number(item.qty) || 0);
      const price = Math.max(0, Number(item.price) || 0);
      const amount = Number(item.subtotal) || qty * price;
      const productId = String(item.id || item.productId || item.name || item.product || "item").trim();

      if(!qty || !productId){
        return null;
      }

      return {
        id:`${order.id}:${productId}`,
        orderId:order.id,
        orderNumber:Number(order.orderNumber) || 0,
        orderDate:order.orderDate || formatLocalDate(new Date(timestamp)),
        timestamp,
        productId,
        product:String(item.name || item.product || "Item").trim(),
        quantity:qty,
        price,
        amount,
        transactionTotal,
        source:order.source === "cashier" ? "Cashier" : "Customer",
        status:order.status || ""
      };
    })
    .filter(Boolean);
}

function transactionLineKey(line){
  return String(line.id || `${line.orderId}:${line.productId}:${line.product}`);
}

async function writeDataRecord(key, filePath, value){
  const reconnectTolerantKeys = new Set(["personnel-profiles"]);

  requirePersistentStorageForProduction(key, "write");

  try{
    const wroteToDatabase = await withDatabaseRetry(async ()=>{
      const pool = await getDbPool();

      if(!pool){
        return false;
      }
      const dbKey = storageKey(key);
      await pool.query(
        "insert into app_data (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()",
        [dbKey, JSON.stringify(value)]
      );
      return true;
    });

    if(wroteToDatabase){
      return;
    }
  }catch(error){
    if(!isDatabaseConnectionError(error)){
      throw error;
    }
    dbReady = null;
    dbPool = null;
    if(!reconnectTolerantKeys.has(key)){
      throw error;
    }
    console.warn(`Database unavailable while writing ${key}; using fallback data. ${error.message}`);
  }

  await writeJsonFile(filePath, value);
}

function storageKey(key){
  return dataNamespace ? `${dataNamespace}:${key}` : key;
}

function requirePersistentStorageForProduction(key, operation){
  const protectedKeys = new Set([
    "admin-products",
    "orders",
    "orders-watermark",
    "transaction-ledger",
    "expenses",
    "kiosk-settings",
    "students",
    "teacher-accounts",
    "guidance-cases",
    "personnel-profiles"
  ]);

  if(!isProduction || databaseUrl || !protectedKeys.has(key)){
    return;
  }

  if(key === "admin-products"){
    return;
  }

  if(operation === "write"){
    throw new Error("Persistent database is required before saving live records. Connect Render Postgres DATABASE_URL first.");
  }
}

async function readJsonSeed(filePath, fallbackValue){
  if(!await fileExists(filePath)){
    return fallbackValue;
  }

  try{
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  }catch{
    return fallbackValue;
  }
}

async function writeJsonFile(filePath, value){
  await fs.mkdir(path.dirname(filePath), { recursive:true });
  await backupJsonFile(filePath);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
  await fs.rename(tempPath, filePath);
}

async function backupJsonFile(filePath){
  if(!await fileExists(filePath)){
    return;
  }

  const backupPath = `${filePath}.bak`;
  try{
    await fs.copyFile(filePath, backupPath);
  }catch{
    // The main write is still atomic; backup failure should not block orders.
  }
}

async function fileExists(filePath){
  try{
    await fs.access(filePath);
    return true;
  }catch{
    return false;
  }
}

async function ensureJsonFile(filePath, seedPath, fallbackValue){
  await fs.mkdir(path.dirname(filePath), { recursive:true });

  if(await fileExists(filePath)){
    return;
  }

  if(seedPath && await fileExists(seedPath)){
    await fs.copyFile(seedPath, filePath);
    return;
  }

  await writeJsonFile(filePath, fallbackValue);
}

function ensureMenuFile(){
  if(!menuFileReady){
    menuFileReady = removeLegacyMenuFiles().then(async ()=>{
      if(!databaseUrl && !isProduction){
        await ensureJsonFile(menuPath, null, []);
      }
    });
  }

  return menuFileReady;
}

async function removeLegacyMenuFiles(){
  await Promise.all(legacyMenuPaths.map(async filePath=>{
    try{
      await fs.rm(filePath, { force:true });
    }catch{
      // Best-effort cleanup only. Product data must come from admin-products.json.
    }
  }));
}

function ensureOrdersFile(){
  if(!ordersFileReady){
    ordersFileReady = databaseUrl || isProduction ? Promise.resolve() : ensureJsonFile(ordersPath, null, []);
  }

  return ordersFileReady;
}

function clearMenuCache(){
  cachedMenu = null;
  cachedMenuMtime = 0;
  cachedImages.clear();
}

function storageMode(){
  if(databaseUrl){
    return "postgres";
  }

  return isProduction ? "canonical-menu-json-orders" : "json-fallback";
}

async function readMenu(){
  await ensureMenuFile();

  if(databaseUrl){
    const storedMenu = await readDataRecord("admin-products", menuPath, []);
    cachedMenu = normalizeMenu(storedMenu);
    cachedMenuMtime = Date.now();
    cachedImages.clear();
    return cachedMenu;
  }

  const stats = await fs.stat(menuPath);

  if(cachedMenu && cachedMenuMtime === stats.mtimeMs){
    return cachedMenu;
  }

  const menuData = await readDataRecord("admin-products", menuPath, []);
  cachedMenu = normalizeMenu(menuData);
  cachedMenuMtime = stats.mtimeMs;
  cachedImages.clear();
  return cachedMenu;
}

function menuFingerprint(menu){
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizeMenu(menu)))
    .digest("hex")
    .slice(0, 16);
}

function orderableMenuResponse(menu, view){
  if(view !== "customer" && view !== "cashier" && view !== "admin"){
    return menu;
  }

  return menu.map(item=>{
    const fingerprint = item.imageFingerprint || imageFingerprint(item.image);
    return {
      ...item,
      imageFingerprint:fingerprint,
      image:fingerprint ? `/api/menu-image/${encodeURIComponent(item.id)}?v=${encodeURIComponent(fingerprint)}` : ""
    };
  });
}

function restoreStoredMenuImages(menu, storedMenu){
  const storedImages = new Map(
    normalizeMenu(storedMenu).map(item=>[item.id, item.image])
  );

  return (Array.isArray(menu) ? menu : []).map(item=>{
    const id = String(item && item.id || "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const image = String(item && item.image || "").trim();

    if(!image.startsWith("/api/menu-image/")){
      return item;
    }

    return {
      ...item,
      image:storedImages.get(id) || ""
    };
  });
}

async function readLiveRecordCount(reader){
  try{
    const records = await reader();
    const values = Array.isArray(records) ? records : [];

    return {
      count:values.length,
      transactionCount:new Set(values.map(item=>item.orderId || item.id)).size
    };
  }catch{
    return {
      count:0,
      transactionCount:0
    };
  }
}

async function readGuidanceStorageStatus(){
  try{
    const cases = await readGuidanceCases();
    return { ok:true, count:cases.length, message:"" };
  }catch(error){
    return {
      ok:false,
      count:0,
      message:error?.message || "Guidance storage could not be checked.",
      code:String(error?.code || "")
    };
  }
}

async function readLiveMenuStatus(){
  try{
    const menu = await readMenu();

    return {
      count:menu.length,
      fingerprint:menuFingerprint(menu)
    };
  }catch{
    return {
      count:0,
      fingerprint:menuFingerprint([])
    };
  }
}

function kioskBusinessStatus(settings, dateValue = localOrderDate()){
  const cleanSettings = normalizeKioskSettings(settings);
  const date = normalizeDateValue(dateValue) || localOrderDate();
  const open = isKioskOpenOnDate(cleanSettings, date);
  const nextBusinessDate = open ? date : nextOpenBusinessDate(cleanSettings, date);

  return {
    open,
    date,
    nextBusinessDate,
    nextBusinessDay:formatBusinessDate(nextBusinessDate),
    message:open ? "" : `The kiosk is closed today. We will open on ${formatBusinessDate(nextBusinessDate)}.`
  };
}

function isKioskOpenOnDate(settings, dateValue){
  const date = normalizeDateValue(dateValue);

  if(!date){
    return false;
  }

  return settings.operatingDays.includes(dayOfWeek(date)) && !settings.closedDates.includes(date);
}

function nextOpenBusinessDate(settings, dateValue){
  let date = normalizeDateValue(dateValue) || localOrderDate();

  for(let offset = 1; offset <= 370; offset += 1){
    date = addDays(date, 1);

    if(isKioskOpenOnDate(settings, date)){
      return date;
    }
  }

  return addDays(normalizeDateValue(dateValue) || localOrderDate(), 1);
}

function normalizeDateValue(value){
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function dateParts(dateValue){
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  return { year, month, day };
}

function dayOfWeek(dateValue){
  const { year, month, day } = dateParts(dateValue);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
}

function addDays(dateValue, days){
  const { year, month, day } = dateParts(dateValue);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function formatBusinessDate(dateValue){
  const { year, month, day } = dateParts(dateValue);
  return new Intl.DateTimeFormat("en-US", {
    timeZone:"Asia/Manila",
    weekday:"long",
    month:"long",
    day:"numeric"
  }).format(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}

function localOrderDate(){
  return formatLocalDate(new Date());
}

function formatLocalDate(date){
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:"Asia/Manila",
    year:"numeric",
    month:"2-digit",
    day:"2-digit"
  }).formatToParts(date).reduce((items, part)=>{
    items[part.type] = part.value;
    return items;
  }, {});

  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  return `${year}-${month}-${day}`;
}

function lineSalesDate(line){
  const timestamp = line.timestamp || line.completedAt || line.doneAt || line.createdAt;
  const soldAt = new Date(timestamp);

  if(!Number.isNaN(soldAt.getTime())){
    return formatLocalDate(soldAt);
  }

  return line.orderDate || localOrderDate();
}

function orderSalesDate(order){
  if(order.orderDate){
    return order.orderDate;
  }

  const date = new Date(order.createdAt || order.doneAt || order.completedAt || Date.now());
  return formatLocalDate(date);
}

function orderCountsAsSale(order){
  return ["Paid", "Done"].includes(order.status) || order.source === "cashier";
}

function orderSoldAt(order){
  return order.completedAt || order.doneAt || order.createdAt || new Date().toISOString();
}

function dailySalesReport(orders, date){
  return dailySalesReportFromLines(ordersToTransactionLines(orders), date);
}

function dailySalesReportFromLines(lines, date){
  const rows = [];

  lines
    .filter(line=>lineSalesDate(line) === date)
    .forEach(line=>{
      const name = String(line.product || "Item").trim();
      const qty = Math.max(0, Number(line.quantity) || 0);
      const subtotal = Number(line.amount) || qty * (Number(line.price) || 0);

      if(!name || !qty){
        return;
      }

      rows.push({
        name,
        soldAt:line.timestamp,
        orderNumber:Number(line.orderNumber) || 0,
        frequency:qty,
        total:subtotal
      });
    });

  rows.sort((a, b)=>
    b.frequency - a.frequency ||
    b.total - a.total ||
    String(a.soldAt).localeCompare(String(b.soldAt)) ||
    a.name.localeCompare(b.name)
  );

  return {
    date,
    rows,
    totalFrequency:rows.reduce((sum, row)=>sum + row.frequency, 0),
    totalSales:rows.reduce((sum, row)=>sum + row.total, 0)
  };
}

function parseDateValue(value){
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if(!match){
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(0, 0, 0, 0);
  return date;
}

function periodRange(dateValue, period){
  const base = parseDateValue(dateValue) || parseDateValue(localOrderDate());
  const start = new Date(base);
  const end = new Date(base);

  if(period === "week"){
    const day = start.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + offset);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  }else if(period === "month"){
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
  }else{
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

function orderTransactionAt(order){
  return order.completedAt || order.doneAt || order.createdAt || new Date().toISOString();
}

function transactionLedger(orders, options = {}){
  return transactionLedgerFromLines(ordersToTransactionLines(orders), options);
}

function ordersToTransactionLines(orders){
  return (Array.isArray(orders) ? orders : [])
    .filter(order=>orderCountsAsSale(order))
    .flatMap(transactionLinesForOrder);
}

function transactionLedgerFromLines(lines, options = {}){
  const period = ["day", "week", "month", "all"].includes(options.period) ? options.period : "day";
  const date = options.date || localOrderDate();
  const range = period === "all" ? null : periodRange(date, period);
  const rows = (Array.isArray(lines) ? lines : []).filter(line=>{
    const transactionAt = line.timestamp || line.completedAt || line.doneAt || line.createdAt;
    const transactionDate = new Date(transactionAt);
    const transactionLocalDate = Number.isNaN(transactionDate.getTime())
      ? parseDateValue(line.orderDate)
      : parseDateValue(formatLocalDate(transactionDate));

    if(range && (!transactionLocalDate || transactionLocalDate < range.start || transactionLocalDate >= range.end)){
      return false;
    }

    return true;
  }).map(line=>({
    orderId:line.orderId,
    orderNumber:Number(line.orderNumber) || 0,
    timestamp:line.timestamp,
    product:String(line.product || "Item").trim(),
    quantity:Math.max(0, Number(line.quantity) || 0),
    amount:Number(line.amount) || 0,
    transactionTotal:Number(line.transactionTotal) || 0,
    source:line.source || "",
    status:line.status || ""
  }));

  rows.sort((a, b)=>
    String(b.timestamp).localeCompare(String(a.timestamp)) ||
    b.orderNumber - a.orderNumber ||
    a.product.localeCompare(b.product)
  );

  return {
    date,
    period,
    rows,
    transactionCount:new Set(rows.map(row=>row.orderId)).size,
    lineCount:rows.length,
    totalAmount:rows.reduce((sum, row)=>sum + row.amount, 0)
  };
}

function profitReport(transactionLines, expenses, options = {}){
  const period = ["day", "week", "month", "all"].includes(options.period) ? options.period : "day";
  const date = options.date || localOrderDate();
  const salesReport = transactionLedgerFromLines(transactionLines, { date, period });
  const range = period === "all" ? null : periodRange(date, period);
  const expenseRows = (Array.isArray(expenses) ? expenses : []).filter(expense=>{
    const expenseDate = parseDateValue(expense.date);

    if(range && (!expenseDate || expenseDate < range.start || expenseDate >= range.end)){
      return false;
    }

    return true;
  });
  const expenseTotal = expenseRows.reduce((sum, expense)=>sum + (Number(expense.amount) || 0), 0);

  return {
    date,
    period,
    salesTotal:salesReport.totalAmount,
    expenseTotal,
    netProfit:salesReport.totalAmount - expenseTotal,
    expenseCount:expenseRows.length,
    expenseRows:expenseRows
      .slice()
      .sort((a, b)=>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
      )
  };
}

function nextDailyOrderNumber(orders, date = localOrderDate()){
  const todaysOrders = orders.filter(order=>orderSalesDate(order) === date);
  const highest = todaysOrders.reduce((max, order)=>Math.max(max, Number(order.orderNumber) || 0), 0);
  return highest + 1;
}

function pickupSlotCount(orders, pickupTime){
  const today = localOrderDate();
  return orders.filter(order=>order.orderDate === today && order.pickupTime === pickupTime).length;
}

function normalizeMenuCategory(category){
  const value = String(category || "Drinks").trim();
  const normalized = value === "Sandwhich" || value === "Sandwich" ? "Sandwiches" : value;
  const allowed = new Set(["Sandwiches", "Drinks", "Dimsum", "Noodle", "Other"]);

  if(normalized === "Cookies"){
    return "Other";
  }

  return allowed.has(normalized) ? normalized : "Drinks";
}

function normalizeMenuItem(item, index = 0){
  const image = normalizeMenuImage(item.image);
  return {
    id: String(item.id || `item-${index + 1}`).replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    name: String(item.name || "Untitled Product").trim(),
    price: Math.max(0, Number(item.price) || 0),
    theme: String(item.theme || "latte"),
    category: normalizeMenuCategory(item.category),
    image,
    imageFingerprint: imageFingerprint(image),
    available: item.available !== false
  };
}

function normalizeMenuImage(image){
  const value = String(image || "").trim();
  return isForbiddenLegacyImage(value) ? "" : value;
}

function isForbiddenLegacyImage(image){
  const value = String(image || "").toLowerCase();
  const decodedSvg = decodeSvgDataUrl(value);
  const forbiddenPatterns = [
    "images.unsplash.com/photo-1499636136210-6f4ee915583e",
    "upload.wikimedia.org/wikipedia/commons/8/8b/bottle_of_water.png",
    "lotusbiscoff.com/sites/default/files/styles/image_style_scale_width_xs/public/2023-10/biscoff%20hero%20image%20classic%20250g.jpg"
  ];

  return forbiddenPatterns.some(pattern=>value.includes(pattern)) ||
    decodedSvg.includes("biscoff sandwich") ||
    decodedSvg.includes(">water<");
}

function decodeSvgDataUrl(value){
  const match = String(value || "").match(/^data:image\/svg\+xml;base64,(.+)$/i);

  if(!match){
    return "";
  }

  try{
    return Buffer.from(match[1], "base64").toString("utf8").toLowerCase();
  }catch{
    return "";
  }
}

function normalizeMenu(menu){
  return (Array.isArray(menu) ? menu : [])
    .filter(item=>!isForbiddenLegacyProduct(item))
    .map(normalizeMenuItem);
}

function isForbiddenLegacyProduct(item){
  const name = String(item && item.name || "").trim().toLowerCase();
  const id = String(item && item.id || "").trim().toLowerCase();
  const forbiddenNames = new Set([
    "cookies & cream cookie1",
    "cookies and cream cookie1"
  ]);

  return forbiddenNames.has(name) || id === "new-product-1778126157710";
}

function imageFingerprint(value){
  const text = String(value || "");
  let hash1 = 0x811c9dc5;
  let hash2 = 0x01000193;

  for(let index = 0; index < text.length; index += 1){
    const code = text.charCodeAt(index);
    hash1 = Math.imul(hash1 ^ code, 0x01000193) >>> 0;
    hash2 = Math.imul(hash2 + code, 0x811c9dc5) >>> 0;
  }

  return text ? `${hash1.toString(16)}${hash2.toString(16)}`.slice(0, 16) : "";
}

function menuImage(menu, id){
  const item = (Array.isArray(menu) ? menu : []).find(menuItem=>String(menuItem.id || "") === id);
  const image = String(item && item.image || "");
  const cacheKey = `${id}:${imageFingerprint(image)}`;
  const cachedImage = cachedImages.get(cacheKey);

  if(cachedImage){
    return cachedImage;
  }

  if(!image){
    return null;
  }

  if(image.startsWith("http://") || image.startsWith("https://")){
    const response = { redirect:image };
    cachedImages.set(cacheKey, response);
    return response;
  }

  const match = image.match(/^data:([^;,]+);base64,(.+)$/);

  if(match){
    const response = {
      contentType: match[1],
      body: Buffer.from(match[2], "base64")
    };
    cachedImages.set(cacheKey, response);
    return response;
  }

  const encodedMatch = image.match(/^data:([^;,]+),(.*)$/);

  if(!encodedMatch){
    return null;
  }

  const response = {
    contentType: encodedMatch[1],
    body: Buffer.from(decodeURIComponent(encodedMatch[2]), "utf8")
  };
  cachedImages.set(cacheKey, response);
  return response;
}

function csvCell(value){
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function customerReadyMessage(order){
  const orderNumber = String(order.orderNumber || 0).padStart(3, "0");
  return `Your order #${orderNumber} is ready for payment/pickup.`;
}

function normalizePhilippineMobileNumber(value){
  const cleaned = String(value || "").replace(/\D/g, "");

  if(cleaned.startsWith("09") && cleaned.length === 11){
    return `63${cleaned.slice(1)}`;
  }

  if(cleaned.startsWith("9") && cleaned.length === 10){
    return `63${cleaned}`;
  }

  if(cleaned.startsWith("639") && cleaned.length === 12){
    return cleaned;
  }

  return "";
}

async function sendSms(number, message){
  if(!semaphoreApiKey){
    return { ok:false, fallback:true, message:"SMS gateway is not configured yet." };
  }

  const body = new URLSearchParams({
    apikey:semaphoreApiKey,
    number,
    message
  });

  if(semaphoreSenderName){
    body.set("sendername", semaphoreSenderName);
  }

  const response = await fetch("https://api.semaphore.co/api/v4/messages", {
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body
  });
  const text = await response.text();

  if(!response.ok){
    return { ok:false, message:`SMS send failed: ${text}` };
  }

  return { ok:true, response:text };
}

async function handleApi(req, res){
  const pathname = requestPath(req);
  const url = new URL(req.url, "http://localhost");

  if(pathname === "/health" && req.method === "GET"){
    send(res, 200, JSON.stringify({ ok:true, service:"pantanan-preorder" }));
    return true;
  }

  if(pathname === "/api/storage-status" && req.method === "GET"){
    const menu = await readLiveMenuStatus();
    const orders = await readLiveRecordCount(()=>readOrders());
    const transactionLines = await readLiveRecordCount(()=>readReportingTransactionLines());
    const guidance = await readGuidanceStorageStatus();
    send(res, 200, JSON.stringify({
      ok:true,
      menuContractVersion,
      storageMode:storageMode(),
      storagePersistent:Boolean(databaseUrl),
      writeProtected:isProduction && !databaseUrl,
      productWriteProtected:false,
      orderWriteProtected:isProduction && !databaseUrl,
      menuCount:menu.count,
      menuFingerprint:menu.fingerprint,
      orderCount:orders.count,
      transactionLineCount:transactionLines.count,
      transactionCount:transactionLines.transactionCount,
      guidanceStorageOk:guidance.ok,
      guidanceCaseCount:guidance.count,
      guidanceStorageCode:guidance.code,
      guidanceStorageMessage:guidance.message,
      storageWarning:databaseUrl ? "" : "DATABASE_URL is missing. Product saves are allowed, but live orders and transactions are blocked until Render Postgres is connected."
    }));
    return true;
  }

  if(pathname === "/api/config" && req.method === "GET"){
    send(res, 200, JSON.stringify({
      messengerLink:process.env.PANTANAN_MESSENGER_LINK || "https://facebook.com/alexander.moreno.2929",
      whatsappLink:process.env.PANTANAN_WHATSAPP_LINK || "https://wa.me/639695093050",
      smsConfigured:Boolean(semaphoreApiKey)
    }));
    return true;
  }

  if(pathname === "/api/teacher-directory" && req.method === "GET"){
    const teachers = await readTeacherDirectory(true);
    send(res, 200, JSON.stringify({ ok:true, teachers }));
    return true;
  }

  if(pathname === "/api/grade-sections" && req.method === "GET"){
    const sections = await readGradeSections();
    send(res, 200, JSON.stringify({ ok:true, sections }));
    return true;
  }

  if(pathname === "/api/advisory-directory" && req.method === "GET"){
    const advisories = await readAdvisoryDirectory();
    send(res, 200, JSON.stringify({ ok:true, advisories }));
    return true;
  }

  if(pathname === "/api/personnel" && req.method === "GET"){
    const [personnel, fields] = await Promise.all([
      readPersonnelProfiles(true),
      readPersonnelProfileFields(true)
    ]);
    send(res, 200, JSON.stringify({ ok:true, personnel, fields }));
    return true;
  }

  if(pathname === "/api/personnel-profiles" && req.method === "GET"){
    const [personnel, savedProfiles, fields] = await Promise.all([
      readPersonnelProfiles(true),
      readPersonnelProfileRecords(),
      readPersonnelProfileFields(true)
    ]);
    const savedByName = new Map(savedProfiles.map(profile=>[profile.name.toLowerCase(), profile]));
    const profiles = personnel.map(item=>{
      const saved = savedByName.get(item.name.toLowerCase())
        || savedProfiles.find(profile=>samePersonnelName(profile.name, item.name))
        || {};
      return normalizePersonnelProfile({ ...saved, name:item.name });
    });
    savedProfiles.forEach(profile=>{
      const listed = personnel.some(item=>item.name.toLowerCase() === profile.name.toLowerCase())
        || personnel.some(item=>samePersonnelName(profile.name, item.name));
      if(!listed){
        profiles.push(normalizePersonnelProfile(profile));
      }
    });
    send(res, 200, JSON.stringify({ ok:true, profiles, personnel, fields }));
    return true;
  }

  if(pathname === "/api/personnel-profiles" && req.method === "POST"){
    let body;
    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Personnel profile details could not be read." }));
      return true;
    }
    const profile = normalizePersonnelProfile(body.profile || body);
    if(!profile.name){
      send(res, 400, JSON.stringify({ ok:false, message:"Personnel name is required." }));
      return true;
    }
    const session = readTeacherSession(req);
    const currentTeacherProfile = samePersonnelName(profile.name, session?.displayName || session?.username || "");
    if(session && !currentTeacherProfile && session.role !== "admin"){
      send(res, 400, JSON.stringify({ ok:false, message:"You can only save your own personnel profile." }));
      return true;
    }
    profile.name = currentTeacherProfile ? String(session.displayName || profile.name).trim() : profile.name;
    const profiles = await readPersonnelProfileRecords();
    const profileKey = profile.name.toLowerCase();
    const index = profiles.findIndex(item=>item.name.toLowerCase() === profileKey);
    profile.updatedAt = new Date().toISOString();
    let savedProfile;
    if(index >= 0){
      profiles[index] = mergePersonnelProfileData(profiles[index], profile);
      savedProfile = profiles[index];
    }else{
      profiles.unshift(profile);
      savedProfile = profile;
    }
    await writePersonnelProfileRecords(profiles);
    send(res, 200, JSON.stringify({ ok:true, profile:savedProfile }));
    return true;
  }

  if(pathname === "/api/teacher-login" && req.method === "POST"){
    let body;

    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Login details could not be read." }));
      return true;
    }

    const username = String(body.username || "").trim().toLowerCase();
    const pin = String(body.pin || "").trim();
    const guidanceLogin = body.guidanceLogin === true;

    if(!/^\d{4}$/.test(pin)){
      send(res, 400, JSON.stringify({ ok:false, message:"Password must contain exactly 4 digits." }));
      return true;
    }

    if(guidanceLogin){
      if(username !== guidanceAdminUsername || !safeCredentialEqual(pin, guidanceAdminPin)){
        send(res, 401, JSON.stringify({ ok:false, message:"Guidance access is restricted to Alexander Moreno." }));
        return true;
      }

      const accounts = await readTeacherAccounts();
      const account = accounts.find(candidate=>candidate.username === guidanceAdminUsername);
      const guidanceAdmin = account || {
        username:guidanceAdminUsername,
        displayName:"Alexander Moreno",
        role:"admin"
      };

      res.writeHead(200, {
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store",
        "Set-Cookie":teacherCookie(teacherSessionToken(
          { ...guidanceAdmin, role:"admin", guidanceAccess:true },
          true,
          false,
          true
        ))
      });
      res.end(JSON.stringify({
        ok:true,
        username:guidanceAdminUsername,
        displayName:guidanceAdmin.displayName || "Alexander Moreno",
        role:"admin",
        guidanceAccess:true,
        privacyAccepted:true
      }));
      return true;
    }

    const accounts = await readTeacherAccounts();
    const account = accounts.find(candidate=>candidate.username === username);

    const legacyAdminPinAllowed = account?.username === teacherUsername
      && account.role === "admin"
      && safeCredentialEqual(pin, teacherPin);
    const adminDefaultPinBlocked = account?.username === teacherUsername
      && account.role === "admin"
      && safeCredentialEqual(pin, teacherDefaultPin);

    if(!account || !account.active || adminDefaultPinBlocked || (!validTeacherPin(pin, account) && !legacyAdminPinAllowed)){
      send(res, 401, JSON.stringify({ ok:false, message:"Incorrect username or password." }));
      return true;
    }

    res.writeHead(200, {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "Set-Cookie":teacherCookie(teacherSessionToken(account, true))
    });
    res.end(JSON.stringify({
      ok:true,
      username:account.username,
      displayName:account.displayName,
      role:account.role,
      privacyAccepted:true
    }));
    return true;
  }

  if(pathname === "/api/teacher-session" && req.method === "GET"){
    const session = readTeacherSession(req);
    const valid = Boolean(session?.privacyAccepted);
    send(res, valid ? 200 : 401, JSON.stringify({
      ok:valid,
      username:valid ? session.username : "",
      displayName:valid ? session.displayName : "",
      role:valid ? session.role : "",
      adminUnlocked:valid && session.adminUnlocked === true,
      guidanceAccess:valid && session.guidanceAccess === true
    }));
    return true;
  }

  if(pathname === "/api/teacher-consent" && req.method === "POST"){
    const session = readTeacherSession(req);

    if(!session){
      send(res, 200, JSON.stringify({ ok:true, offline:true }));
      return true;
    }

    res.writeHead(200, {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "Set-Cookie":teacherCookie(teacherSessionToken(session, true))
    });
    res.end(JSON.stringify({ ok:true }));
    return true;
  }

  if(pathname === "/api/teacher-change-pin" && req.method === "POST"){
    const session = readTeacherSession(req);
    if(!session?.privacyAccepted){
      send(res, 401, JSON.stringify({ ok:false, message:"Please sign in again before changing your PIN." }));
      return true;
    }

    let body;
    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"PIN details could not be read." }));
      return true;
    }

    const currentPin = String(body.currentPin || "").trim();
    const newPin = String(body.newPin || "").trim();
    if(!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)){
      send(res, 400, JSON.stringify({ ok:false, message:"Both PINs must contain exactly 4 digits." }));
      return true;
    }
    if(currentPin === newPin){
      send(res, 400, JSON.stringify({ ok:false, message:"Choose a new PIN that is different from your current PIN." }));
      return true;
    }

    const accounts = await readTeacherAccounts();
    const index = accounts.findIndex(account=>account.username === session.username);
    const account = index >= 0 ? accounts[index] : null;
    if(!account || !account.active){
      send(res, 404, JSON.stringify({ ok:false, message:"Your teacher account is not active." }));
      return true;
    }
    if(!validTeacherPin(currentPin, account)){
      send(res, 401, JSON.stringify({ ok:false, message:"Current PIN is incorrect." }));
      return true;
    }

    const pinSalt = crypto.randomBytes(16).toString("hex");
    accounts[index] = {
      ...account,
      pinSalt,
      pinHash:teacherPinHash(newPin, pinSalt),
      updatedAt:new Date().toISOString()
    };
    await writeTeacherAccounts(accounts);
    send(res, 200, JSON.stringify({
      ok:true,
      username:account.username,
      message:"Your PIN was changed successfully."
    }));
    return true;
  }

  if(pathname === "/api/teacher-admin-unlock" && req.method === "POST"){
    const session = readTeacherSession(req);
    if(!session?.privacyAccepted || session.role !== "admin"){
      send(res, 403, JSON.stringify({ ok:false, message:"Administrator access required." }));
      return true;
    }

    let body;
    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Password could not be read." }));
      return true;
    }

    if(!safeCredentialEqual(String(body.password || ""), teacherAdminPassword)){
      send(res, 401, JSON.stringify({ ok:false, message:"Incorrect Teacher Accounts password." }));
      return true;
    }

    res.writeHead(200, {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "Set-Cookie":teacherCookie(teacherSessionToken(session, true, true))
    });
    res.end(JSON.stringify({ ok:true }));
    return true;
  }

  if(pathname === "/api/teacher-accounts" && req.method === "GET"){
    if(!requireTeacherAdmin(req, res)){
      return true;
    }
    const accounts = await readTeacherAccounts();
    send(res, 200, JSON.stringify({
      ok:true,
      accounts:accounts.map(publicTeacherAccount).sort((a, b)=>a.displayName.localeCompare(b.displayName))
    }));
    return true;
  }

  if(pathname === "/api/teacher-accounts" && req.method === "POST"){
    if(!requireTeacherAdmin(req, res)){
      return true;
    }

    let body;
    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Teacher account details could not be read." }));
      return true;
    }

    const displayName = String(body.displayName || "").trim();
    const pin = String(body.pin || "").trim();
    const directory = await readTeacherDirectory();
    const directoryTeacher = directory.find(teacher=>teacher.displayName === displayName);
    const username = directoryTeacher?.username || "";

    if(!directoryTeacher){
      send(res, 400, JSON.stringify({ ok:false, message:"Select a teacher from the official teacher list." }));
      return true;
    }
    if(!displayName){
      send(res, 400, JSON.stringify({ ok:false, message:"Teacher name is required." }));
      return true;
    }
    if(!/^\d{4}$/.test(pin)){
      send(res, 400, JSON.stringify({ ok:false, message:"PIN must contain exactly 4 digits." }));
      return true;
    }

    const accounts = await readTeacherAccounts();
    if(accounts.some(account=>account.username === username)){
      send(res, 409, JSON.stringify({ ok:false, message:"That username is already registered." }));
      return true;
    }

    const account = createTeacherAccount({ username, displayName, pin, role:"teacher" });
    accounts.push(account);
    await writeTeacherAccounts(accounts);
    send(res, 201, JSON.stringify({ ok:true, account:publicTeacherAccount(account) }));
    return true;
  }

  if(pathname.startsWith("/api/teacher-accounts/") && req.method === "PUT"){
    const session = requireTeacherAdmin(req, res);
    if(!session){
      return true;
    }

    const username = normalizedTeacherUsername(decodeURIComponent(pathname.split("/")[3] || ""));
    let body;
    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Teacher account changes could not be read." }));
      return true;
    }

    const accounts = await readTeacherAccounts();
    const index = accounts.findIndex(account=>account.username === username);
    if(index < 0){
      send(res, 404, JSON.stringify({ ok:false, message:"Teacher account not found." }));
      return true;
    }

    const account = { ...accounts[index] };
    if(body.displayName !== undefined){
      const displayName = String(body.displayName || "").trim();
      if(!displayName){
        send(res, 400, JSON.stringify({ ok:false, message:"Teacher name is required." }));
        return true;
      }
      account.displayName = displayName;
    }
    if(body.pin !== undefined && String(body.pin).trim()){
      const pin = String(body.pin).trim();
      if(!/^\d{4}$/.test(pin)){
        send(res, 400, JSON.stringify({ ok:false, message:"PIN must contain exactly 4 digits." }));
        return true;
      }
      account.pinSalt = crypto.randomBytes(16).toString("hex");
      account.pinHash = teacherPinHash(pin, account.pinSalt);
    }
    if(body.active !== undefined){
      if(username === session.username && body.active === false){
        send(res, 400, JSON.stringify({ ok:false, message:"You cannot disable your own administrator account." }));
        return true;
      }
      account.active = body.active !== false;
    }
    account.updatedAt = new Date().toISOString();
    accounts[index] = account;
    await writeTeacherAccounts(accounts);
    send(res, 200, JSON.stringify({ ok:true, account:publicTeacherAccount(account) }));
    return true;
  }

  if(pathname.startsWith("/api/teacher-accounts/") && req.method === "DELETE"){
    const session = requireTeacherAdmin(req, res);
    if(!session){
      return true;
    }

    const username = normalizedTeacherUsername(decodeURIComponent(pathname.split("/")[3] || ""));
    if(username === session.username){
      send(res, 400, JSON.stringify({ ok:false, message:"You cannot delete your own administrator account." }));
      return true;
    }

    const accounts = await readTeacherAccounts();
    const index = accounts.findIndex(account=>account.username === username);
    if(index < 0){
      send(res, 404, JSON.stringify({ ok:false, message:"Teacher account not found." }));
      return true;
    }
    const [account] = accounts.splice(index, 1);
    await writeTeacherAccounts(accounts);
    send(res, 200, JSON.stringify({ ok:true, account:publicTeacherAccount(account) }));
    return true;
  }

  if(pathname === "/api/teacher-logout" && req.method === "POST"){
    res.writeHead(200, {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "Set-Cookie":teacherCookie("", 0)
    });
    res.end(JSON.stringify({ ok:true }));
    return true;
  }

  if(pathname === "/api/guidance-cases" && req.method === "GET"){
    try{
      const cases = await readGuidanceCases();
      send(res, 200, JSON.stringify({ ok:true, cases }));
    }catch(error){
      send(res, isDatabaseConnectionError(error) ? 503 : 500, JSON.stringify({
        ok:false,
        message:isDatabaseConnectionError(error)
          ? "Guidance database is unavailable. Cases could not be loaded."
          : "Guidance cases could not be loaded."
      }));
    }
    return true;
  }

  if(pathname === "/api/guidance-cases" && req.method === "POST"){
    let body;
    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Guidance case details could not be read." }));
      return true;
    }

    try{
      const cases = await readGuidanceCases();
      const guidanceCase = await buildGuidanceCase(body, null, readTeacherSession(req));
      const requestedCaseNumber = String(body.caseNumber || "").trim();
      const existingCase = requestedCaseNumber
        ? cases.find(item=>String(item.caseNumber || "").trim().toLowerCase() === requestedCaseNumber.toLowerCase())
        : null;
      if(existingCase){
        send(res, 200, JSON.stringify({ ok:true, guidanceCase:existingCase }));
        return true;
      }
      guidanceCase.caseNumber = /^GDC-\d{4}-\d{4}$/i.test(requestedCaseNumber)
        ? requestedCaseNumber.toUpperCase()
        : nextGuidanceCaseNumber(cases, guidanceCase.reportDate);
      cases.unshift(guidanceCase);
      await writeGuidanceCases(cases);
      send(res, 201, JSON.stringify({ ok:true, guidanceCase }));
    }catch(error){
      send(res, isDatabaseConnectionError(error) ? 503 : 400, JSON.stringify({
        ok:false,
        message:isDatabaseConnectionError(error)
          ? "Guidance database is unavailable. Case was not saved."
          : error.message
      }));
    }
    return true;
  }

  if(pathname.startsWith("/api/guidance-cases/") && req.method === "PUT"){
    const id = decodeURIComponent(pathname.split("/")[3] || "");
    let body;
    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Guidance case details could not be read." }));
      return true;
    }

    const cases = await readGuidanceCases();
    const index = cases.findIndex(item=>item.id === id);
    if(index < 0){
      send(res, 404, JSON.stringify({ ok:false, message:"Guidance case not found." }));
      return true;
    }

    try{
      const guidanceCase = await buildGuidanceCase(body, cases[index], readTeacherSession(req));
      guidanceCase.caseNumber = cases[index].caseNumber;
      cases[index] = guidanceCase;
      await writeGuidanceCases(cases);
      send(res, 200, JSON.stringify({ ok:true, guidanceCase }));
  }catch(error){
    send(res, isDatabaseConnectionError(error) ? 503 : 400, JSON.stringify({
      ok:false,
      message:isDatabaseConnectionError(error)
        ? "Guidance database is unavailable. Case was not saved."
        : error.message
    }));
  }
  return true;
}

  if(pathname.startsWith("/api/guidance-cases/") && req.method === "DELETE"){
    const id = decodeURIComponent(pathname.split("/")[3] || "");
    try{
      const cases = await readGuidanceCases();
      const index = cases.findIndex(item=>item.id === id);
      if(index < 0){
        send(res, 404, JSON.stringify({ ok:false, message:"Guidance case not found." }));
        return true;
      }
      const [guidanceCase] = cases.splice(index, 1);
      await writeGuidanceCases(cases);
      send(res, 200, JSON.stringify({ ok:true, guidanceCase }));
    }catch(error){
      send(res, isDatabaseConnectionError(error) ? 503 : 400, JSON.stringify({
        ok:false,
        message:isDatabaseConnectionError(error)
          ? "Guidance database is unavailable. Case was not deleted."
          : error.message
      }));
    }
    return true;
  }

  if((pathname === "/api/students" || pathname === "/api/students.csv" || pathname.startsWith("/api/students/")) && !validTeacherSession(req)){
    send(res, 401, JSON.stringify({ ok:false, message:"Teacher login required." }));
    return true;
  }

  if(pathname === "/api/students" && req.method === "GET"){
    const students = await readStudents();
    send(res, 200, JSON.stringify({ ok:true, students }));
    return true;
  }

  if(pathname === "/api/students.csv" && req.method === "GET"){
    const students = await readStudents();
    const columns = [
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
    const rows = [
      columns.map(([label])=>label),
      ...students.map(student=>columns.map(([, key])=>student[key] || ""))
    ];
    const csv = `\uFEFF${rows.map(row=>row.map(csvCell).join(",")).join("\n")}`;
    res.writeHead(200, {
      "Content-Type":"text/csv; charset=utf-8",
      "Content-Disposition":`attachment; filename="student-records-${localOrderDate()}.csv"`,
      "Cache-Control":"no-store"
    });
    res.end(csv);
    return true;
  }

  if(pathname === "/api/students/reorder" && req.method === "POST"){
    let body;

    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Reorder request could not be read." }));
      return true;
    }

    const id = String(body.id || "").trim();
    const direction = String(body.direction || "").trim().toLowerCase();
    if(!id || !["up", "down"].includes(direction)){
      send(res, 400, JSON.stringify({ ok:false, message:"A learner and move direction are required." }));
      return true;
    }

    const students = await readStudents();
    const index = students.findIndex(student=>student.id === id);

    if(index < 0){
      send(res, 404, JSON.stringify({ ok:false, message:"Student record not found." }));
      return true;
    }

    const section = students[index].gradeSection;
    const candidateIndexes = students
      .map((student, studentIndex)=>student.gradeSection === section ? studentIndex : -1)
      .filter(studentIndex=>studentIndex >= 0);
    const currentPosition = candidateIndexes.indexOf(index);
    const targetPosition = direction === "up" ? currentPosition - 1 : currentPosition + 1;

    if(targetPosition < 0 || targetPosition >= candidateIndexes.length){
      send(res, 409, JSON.stringify({
        ok:false,
        message:`This learner is already at the ${direction === "up" ? "top" : "bottom"} of ${section}.`
      }));
      return true;
    }

    const targetIndex = candidateIndexes[targetPosition];
    [students[index], students[targetIndex]] = [students[targetIndex], students[index]];
    await writeStudents(students);
    send(res, 200, JSON.stringify({ ok:true, students }));
    return true;
  }

  if(pathname === "/api/students" && req.method === "POST"){
    let body;

    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Student record could not be read." }));
      return true;
    }

    const requestedId = String(body.id || "").trim();
    const student = normalizeStudent({
      ...body,
      id:/^[a-zA-Z0-9-]{16,80}$/.test(requestedId) ? requestedId : crypto.randomUUID(),
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    });

    if(!student || !student.gradeSection || !student.familyName || !student.firstName){
      send(res, 400, JSON.stringify({ ok:false, message:"Grade/Section, Family Name, and First Name are required." }));
      return true;
    }

    const students = await readStudents();
    const existingId = students.find(existing=>existing.id === student.id);

    if(existingId){
      send(res, 200, JSON.stringify({ ok:true, student:existingId, alreadySynced:true }));
      return true;
    }

    const duplicate = duplicateStudentLrn(students, student.lrn);

    if(duplicate){
      send(res, 409, JSON.stringify({
        ok:false,
        message:`LRN ${student.lrn} already belongs to ${duplicate.familyName}, ${duplicate.firstName}.`
      }));
      return true;
    }

    students.unshift(student);
    let sheetSynced;
    try{
      sheetSynced = await syncStudentToGoogleSheet("create", student);
    }catch(error){
      send(res, 502, JSON.stringify({ ok:false, message:`Record was not saved because ${error.message}` }));
      return true;
    }
    await writeStudents(students);
    send(res, 201, JSON.stringify({ ok:true, student, sheetSynced }));
    return true;
  }

  if(pathname.startsWith("/api/students/") && req.method === "PUT"){
    const id = decodeURIComponent(pathname.split("/")[3] || "");
    let body;

    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Student record could not be read." }));
      return true;
    }

    const students = await readStudents();
    const index = students.findIndex(student=>student.id === id);

    if(index < 0){
      send(res, 404, JSON.stringify({ ok:false, message:"Student record not found." }));
      return true;
    }

    const student = normalizeStudent({
      ...students[index],
      ...body,
      id,
      createdAt:students[index].createdAt,
      updatedAt:new Date().toISOString()
    });

    if(!student || !student.gradeSection || !student.familyName || !student.firstName){
      send(res, 400, JSON.stringify({ ok:false, message:"Grade/Section, Family Name, and First Name are required." }));
      return true;
    }

    const duplicate = duplicateStudentLrn(students, student.lrn, id);

    if(duplicate){
      send(res, 409, JSON.stringify({
        ok:false,
        message:`LRN ${student.lrn} already belongs to ${duplicate.familyName}, ${duplicate.firstName}.`
      }));
      return true;
    }

    const previousStudent = students[index];
    let sheetSynced;
    try{
      sheetSynced = await syncStudentToGoogleSheet("update", student, previousStudent);
    }catch(error){
      send(res, 502, JSON.stringify({ ok:false, message:`Record was not saved because ${error.message}` }));
      return true;
    }
    students[index] = student;
    await writeStudents(students);
    send(res, 200, JSON.stringify({ ok:true, student, sheetSynced }));
    return true;
  }

  if(pathname.startsWith("/api/students/") && req.method === "DELETE"){
    const id = decodeURIComponent(pathname.split("/")[3] || "");
    const students = await readStudents();
    const index = students.findIndex(student=>student.id === id);

    if(index < 0){
      send(res, 404, JSON.stringify({ ok:false, message:"Student record not found." }));
      return true;
    }

    const student = students[index];
    let sheetSynced;
    try{
      sheetSynced = await syncStudentToGoogleSheet("delete", student, student);
    }catch(error){
      send(res, 502, JSON.stringify({ ok:false, message:`Record was not deleted because ${error.message}` }));
      return true;
    }
    students.splice(index, 1);
    await writeStudents(students);
    send(res, 200, JSON.stringify({ ok:true, student, sheetSynced }));
    return true;
  }

  if(pathname === "/api/kiosk-settings" && req.method === "GET"){
    const settings = await readKioskSettings();
    send(res, 200, JSON.stringify({
      ok:true,
      settings,
      status:kioskBusinessStatus(settings)
    }));
    return true;
  }

  if(pathname === "/api/kiosk-settings" && req.method === "PUT"){
    let body;

    try{
      body = JSON.parse(await readBody(req) || "{}");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Kiosk settings could not be read." }));
      return true;
    }

    try{
      const settings = await writeKioskSettings(body);
      send(res, 200, JSON.stringify({
        ok:true,
        settings,
        status:kioskBusinessStatus(settings)
      }));
    }catch(error){
      const message = databaseUrl
        ? "Server could not save kiosk operating days."
        : "Save blocked: DATABASE_URL is missing, so kiosk settings cannot be saved safely.";
      send(res, 500, JSON.stringify({ ok:false, message, detail:error.message }));
    }
    return true;
  }

  if(pathname === "/api/kiosk-status" && req.method === "GET"){
    const settings = await readKioskSettings();
    send(res, 200, JSON.stringify({
      ok:true,
      status:kioskBusinessStatus(settings)
    }));
    return true;
  }

  if(pathname === "/api/menu" && req.method === "GET"){
    const view = url.searchParams.get("view");
    const fullMenu = normalizeMenu(await readMenu());
    const responseMenu = orderableMenuResponse(fullMenu, view);
    res.writeHead(200, {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Menu-Source":"admin-persistent-menu",
      "X-Menu-File":"admin-products",
      "X-Menu-Storage":storageMode(),
      "X-Menu-Version":menuContractVersion,
      "X-Menu-Fingerprint":menuFingerprint(fullMenu),
      "X-Menu-Count":String(responseMenu.length),
      "X-Menu-View":view || "admin"
    });
    res.end(JSON.stringify(responseMenu));
    return true;
  }

  if(pathname.startsWith("/api/menu-image/") && req.method === "GET"){
    const id = decodeURIComponent(pathname.split("/").slice(3).join("/"));
    const menu = await readMenu();
    const image = menuImage(menu, id);

    if(!image){
      send(res, 404, "Not found", "text/plain; charset=utf-8");
      return true;
    }

    if(image.redirect){
      res.writeHead(302, {
        "Location": image.redirect,
        "Cache-Control":"public, max-age=604800, immutable"
      });
      res.end();
      return true;
    }

    res.writeHead(200, {
      "Content-Type":image.contentType,
      "Cache-Control":"public, max-age=604800, immutable"
    });
    res.end(image.body);
    return true;
  }

  if(pathname === "/api/menu" && req.method === "PUT"){
    let menu;

    try{
      menu = JSON.parse(await readBody(req) || "[]");
    }catch{
      send(res, 400, JSON.stringify({ ok:false, message:"Products could not be read. Try smaller pictures." }));
      return true;
    }

    if(!Array.isArray(menu)){
      send(res, 400, JSON.stringify({ ok:false, message:"Menu must be an array" }));
      return true;
    }

    if(menu.length === 0){
      send(res, 400, JSON.stringify({ ok:false, message:"Save blocked: product list is empty." }));
      return true;
    }

    const storedMenu = await readMenu();
    const cleanMenu = normalizeMenu(restoreStoredMenuImages(menu, storedMenu));

    try{
      await writeDataRecord("admin-products", menuPath, cleanMenu);
      clearMenuCache();
    }catch(error){
      const message = databaseUrl
        ? "Server could not save products. Your browser backup is still available."
        : "Save blocked: DATABASE_URL is missing, so products cannot be saved safely. Connect Render Postgres first.";
      send(res, 500, JSON.stringify({ ok:false, message, detail:error.message }));
      return true;
    }

    send(res, 200, JSON.stringify({ ok:true, menu:orderableMenuResponse(cleanMenu, "admin") }));
    return true;
  }

  if(pathname === "/api/orders" && req.method === "GET"){
    const source = url.searchParams.get("source");
    const orders = await readOrders();

    if(source === "customer"){
      send(res, 200, JSON.stringify(orders.filter(order=>!order.source)));
      return true;
    }

    if(source === "cashier"){
      send(res, 200, JSON.stringify(orders.filter(order=>order.source === "cashier")));
      return true;
    }

    send(res, 200, JSON.stringify(orders));
    return true;
  }

  if(pathname === "/api/customers.csv" && req.method === "GET"){
    const orders = await readOrders();
    const seen = new Map();

    orders.forEach(order=>{
      const contact = String(order.customerContact || "").trim();

      if(!contact){
        return;
      }

      const key = contact.toLowerCase();
      const previous = seen.get(key);

      if(!previous || String(order.createdAt || "") > String(previous.createdAt || "")){
        seen.set(key, order);
      }
    });

    const rows = [
      ["Nickname", "Contact", "Last Order Number", "Last Pickup Time", "Last Order Date"]
    ];

    [...seen.values()]
      .sort((a, b)=>String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .forEach(order=>{
        rows.push([
          order.customerName || "",
          order.customerContact || "",
          String(order.orderNumber || "").padStart(3, "0"),
          order.pickupTime || "",
          order.createdAt || ""
        ]);
      });

    const csv = rows.map(row=>row.map(csvCell).join(",")).join("\n");
    res.writeHead(200, {
      "Content-Type":"text/csv; charset=utf-8",
      "Content-Disposition":"attachment; filename=\"pantanan-customers.csv\"",
      "Cache-Control":"no-store"
    });
    res.end(csv);
    return true;
  }

  if(pathname === "/api/sales/daily" && req.method === "GET"){
    const date = url.searchParams.get("date") || localOrderDate();
    const transactionLines = await readReportingTransactionLines();
    send(res, 200, JSON.stringify({ ok:true, report:dailySalesReportFromLines(transactionLines, date) }));
    return true;
  }

  if(pathname === "/api/sales/profit" && req.method === "GET"){
    const transactionLines = await readReportingTransactionLines();
    const expenses = await readExpenses();
    send(res, 200, JSON.stringify({
      ok:true,
      report:profitReport(transactionLines, expenses, {
        date:url.searchParams.get("date") || localOrderDate(),
        period:url.searchParams.get("period") || "day"
      })
    }));
    return true;
  }

  if(pathname === "/api/transactions" && req.method === "GET"){
    const transactionLines = await readReportingTransactionLines();
    send(res, 200, JSON.stringify({
      ok:true,
      report:transactionLedgerFromLines(transactionLines, {
        date:url.searchParams.get("date") || localOrderDate(),
        period:url.searchParams.get("period") || "day"
      })
    }));
    return true;
  }

  if(pathname === "/api/transactions/backfill" && req.method === "POST"){
    const result = await backfillTransactionLedgerFromOrders();
    send(res, 200, JSON.stringify({ ok:true, ...result }));
    return true;
  }

  if(pathname === "/api/expenses" && req.method === "GET"){
    const date = url.searchParams.get("date") || "";
    const expenses = await readExpenses();
    const rows = date ? expenses.filter(expense=>expense.date === date) : expenses;
    send(res, 200, JSON.stringify({
      ok:true,
      expenses:rows.sort((a, b)=>String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
      total:rows.reduce((sum, expense)=>sum + (Number(expense.amount) || 0), 0)
    }));
    return true;
  }

  if(pathname === "/api/expenses" && req.method === "POST"){
    const body = JSON.parse(await readBody(req) || "{}");
    const expense = normalizeExpense({
      date:body.date,
      item:body.item,
      amount:body.amount,
      createdAt:new Date().toISOString()
    });

    if(!expense || !expense.date || !expense.item || !expense.amount){
      send(res, 400, JSON.stringify({ ok:false, message:"Please enter date, item, and amount." }));
      return true;
    }

    const expenses = await readExpenses();
    const nextExpenses = [expense, ...expenses];
    await writeDataRecord("expenses", expensesPath, nextExpenses);
    send(res, 200, JSON.stringify({ ok:true, expense, expenses:nextExpenses }));
    return true;
  }

  if(pathname.startsWith("/api/expenses/") && req.method === "PUT"){
    const id = decodeURIComponent(pathname.split("/").slice(3).join("/"));
    const body = JSON.parse(await readBody(req) || "{}");
    const expenses = await readExpenses();
    const index = expenses.findIndex(expense=>expense.id === id);

    if(index === -1){
      send(res, 404, JSON.stringify({ ok:false, message:"Expense not found" }));
      return true;
    }

    const updatedExpense = normalizeExpense({
      ...expenses[index],
      date:body.date,
      item:body.item,
      amount:body.amount
    });

    if(!updatedExpense || !updatedExpense.date || !updatedExpense.item || !updatedExpense.amount){
      send(res, 400, JSON.stringify({ ok:false, message:"Please enter date, item, and amount." }));
      return true;
    }

    const nextExpenses = expenses.slice();
    nextExpenses[index] = updatedExpense;
    await writeDataRecord("expenses", expensesPath, nextExpenses);
    send(res, 200, JSON.stringify({ ok:true, expense:updatedExpense, expenses:nextExpenses }));
    return true;
  }

  if(pathname.startsWith("/api/orders/") && req.method === "GET"){
    const id = pathname.split("/")[3];
    const orders = await readOrders();
    const order = orders.find(item=>item.id === id);

    if(!order){
      send(res, 404, JSON.stringify({ ok:false, message:"Order not found" }));
      return true;
    }

    send(res, 200, JSON.stringify({ ok:true, order }));
    return true;
  }

  if(pathname === "/api/orders" && req.method === "POST"){
    const body = JSON.parse(await readBody(req) || "{}");
    const menu = await readMenu();
    const orders = await readOrders();
    const items = Array.isArray(body.items) ? body.items : [];
    const source = String(body.source || "customer").trim().toLowerCase() === "cashier" ? "cashier" : "";
    const isCashierOrder = source === "cashier";
    const clientTransactionId = isCashierOrder ? String(body.clientTransactionId || "").trim().slice(0, 120) : "";
    const existingCashierOrder = clientTransactionId
      ? orders.find(order=>order.source === "cashier" && order.clientTransactionId === clientTransactionId)
      : null;

    if(!isCashierOrder){
      const settings = await readKioskSettings();
      const status = kioskBusinessStatus(settings);

      if(!status.open){
        send(res, 400, JSON.stringify({ ok:false, message:status.message, status }));
        return true;
      }
    }

    if(existingCashierOrder){
      send(res, 200, JSON.stringify({ ok:true, duplicate:true, order:existingCashierOrder }));
      return true;
    }

    const cleanItems = items
      .map(item=>{
        const product = menu.find(menuItem=>menuItem.id === item.id);
        const qty = Math.max(0, Number(item.qty) || 0);
        const allowCashierSnapshot = isCashierOrder && clientTransactionId;

        if((!product && !allowCashierSnapshot) || qty === 0){
          return null;
        }

        const price = allowCashierSnapshot && Number.isFinite(Number(item.price))
          ? Math.max(0, Number(item.price))
          : Number(product.price) || 0;
        return {
          id: String((product && product.id) || item.id || item.name || crypto.randomUUID()),
          name: String((allowCashierSnapshot && item.name) || (product && product.name) || "Item").trim(),
          qty,
          price,
          subtotal: qty * price
        };
      })
      .filter(Boolean);

    const customerContact = String(body.customerContact || body.customerMessenger || "").trim();
    const normalizedContact = customerContact ? normalizePhilippineMobileNumber(customerContact) : "";

    if(!body.pickupTime || cleanItems.length === 0){
      send(res, 400, JSON.stringify({ ok:false, message:"Order is incomplete" }));
      return true;
    }

    if(customerContact && !normalizedContact){
      send(res, 400, JSON.stringify({ ok:false, message:"Please enter a valid Philippine mobile number." }));
      return true;
    }

    const pickupTime = String(body.pickupTime);

    if(!isCashierOrder && pickupSlotCount(orders, pickupTime) >= 5){
      send(res, 400, JSON.stringify({ ok:false, message:"That pickup time is already full. Please select the next available time." }));
      return true;
    }

    const total = cleanItems.reduce((sum, item)=>sum + item.subtotal, 0);
    const cashReceived = Math.max(0, Number(body.cashReceived) || 0);
    const completedAt = new Date().toISOString();
    const orderDate = localOrderDate();
    const orderNumber = nextDailyOrderNumber(orders, orderDate);
    const order = {
      id: Date.now().toString(),
      orderNumber,
      orderDate,
      customerName: String(body.customerName || `CUSTOMER #${String(orderNumber).padStart(3, "0")}`).trim().toUpperCase(),
      customerContact:normalizedContact,
      pickupTime,
      status: isCashierOrder ? "Done" : "Order Sent",
      source,
      clientTransactionId,
      createdAt: completedAt,
      items: cleanItems,
      total
    };

    if(isCashierOrder){
      order.completedAt = completedAt;
      order.doneAt = completedAt;
      order.cashReceived = cashReceived;
      order.change = Math.max(0, cashReceived - total);
    }

    orders.unshift(order);
    await writeOrders(orders);
    if(isCashierOrder){
      await appendTransactionLinesForOrder(order);
    }
    send(res, 200, JSON.stringify({ ok:true, order }));
    return true;
  }

  if(pathname.startsWith("/api/orders/") && pathname.endsWith("/preparing") && req.method === "POST"){
    const id = pathname.split("/")[3];
    const orders = await readOrders();
    const order = orders.find(item=>item.id === id);

    if(!order){
      send(res, 404, JSON.stringify({ ok:false, message:"Order not found" }));
      return true;
    }

    if(order.status !== "Preparing Order"){
      order.status = "Preparing Order";
      order.preparingAt = new Date().toISOString();
    }
    await writeOrders(orders);
    send(res, 200, JSON.stringify({ ok:true, order }));
    return true;
  }

  if(pathname.startsWith("/api/orders/") && pathname.endsWith("/done") && req.method === "POST"){
    const id = pathname.split("/")[3];
    const orders = await readOrders();
    const order = orders.find(item=>item.id === id);

    if(!order){
      send(res, 404, JSON.stringify({ ok:false, message:"Order not found" }));
      return true;
    }

    order.status = "Ready for Payment and Pickup";
    order.doneAt = new Date().toISOString();
    await writeOrders(orders);
    send(res, 200, JSON.stringify({ ok:true, order }));
    return true;
  }

  if(pathname.startsWith("/api/orders/") && pathname.endsWith("/complete") && req.method === "POST"){
    const id = pathname.split("/")[3];
    const orders = await readOrders();
    const order = orders.find(item=>item.id === id);

    if(!order){
      send(res, 404, JSON.stringify({ ok:false, message:"Order not found" }));
      return true;
    }

    order.status = "Done";
    order.completedAt = new Date().toISOString();
    order.customerStatus = "Done";
    order.customerStatusAt = order.completedAt;
    await writeOrders(orders);
    await appendTransactionLinesForOrder(order);
    send(res, 200, JSON.stringify({ ok:true, order }));
    return true;
  }

  if(pathname.startsWith("/api/orders/") && pathname.endsWith("/sms") && req.method === "POST"){
    const id = pathname.split("/")[3];
    const orders = await readOrders();
    const order = orders.find(item=>item.id === id);

    if(!order){
      send(res, 404, JSON.stringify({ ok:false, message:"Order not found" }));
      return true;
    }

    const number = normalizePhilippineMobileNumber(order.customerContact || "");

    if(!number){
      send(res, 400, JSON.stringify({ ok:false, message:"Customer number is not a valid mobile number." }));
      return true;
    }

    const message = customerReadyMessage(order);
    const smsResult = await sendSms(number, message);

    if(!smsResult.ok){
      send(res, smsResult.fallback ? 503 : 502, JSON.stringify(smsResult));
      return true;
    }

    order.status = "Ready for Payment and Pickup";
    order.doneAt = new Date().toISOString();
    order.smsSentAt = order.doneAt;
    order.smsRecipient = number;
    await writeOrders(orders);
    send(res, 200, JSON.stringify({ ok:true, order }));
    return true;
  }

  return false;
}

async function serveStatic(req, res){
  const pathname = requestPath(req);
  const requestUrl = new URL(req.url, "http://localhost");
  const host = String(req.headers.host || "").toLowerCase();
  const rootPage = teacherProfileHome || host.startsWith("teacher-profile.")
    ? "teacher-profile.html"
    : "index.html";
  const routes = {
    "/": rootPage,
    "/customer": "index.html",
    "/admin": "admin.html",
    "/cashier": "cashier.html",
    "/kitchen": "kitchen.html",
    "/sales": "sales.html",
    "/transaction": "transactions.html",
    "/transactions": "transactions.html",
    "/expenses": "expenses.html",
    "/offline-reset": "offline-reset.html",
    "/login": "teacher-login.html",
    "/teacher-login": "teacher-login.html",
    "/teacher-accounts": "teacher-accounts.html",
    "/teacher-accounts-offline-shell": "teacher-accounts.html",
    "/personnel": "personnel.html",
    "/personnel-offline-shell": "personnel.html",
    "/personnel-profile": "personnel-profile.html",
    "/personnel-profile-offline-shell": "personnel-profile.html",
    "/student-dashboard": "student-dashboard.html",
    "/student-dashboard-offline-shell": "student-dashboard.html",
    "/students": "students.html",
    "/students-offline-shell": "students.html",
    "/guidance": "guidance.html",
    "/guidance-offline-shell": "guidance.html",
    "/guidance-report": "guidance-report.html",
    "/guidance-report-offline-shell": "guidance-report.html",
    "/teacher-profile": "teacher-profile.html",
    "/mineralex": "mineralex/index.html",
    "/qr": "qr.html"
  };

  if((pathname === "/login" || pathname === "/teacher-login") && (requestUrl.searchParams.has("username") || requestUrl.searchParams.has("pin"))){
    const next = requestUrl.searchParams.get("next");
    sendRedirect(res, next && next.startsWith("/") && !next.startsWith("//")
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login");
    return;
  }

  if(pathname === "/teacher-login" || pathname === "/teacher-login.html"){
    const next = requestUrl.searchParams.get("next");
    sendRedirect(res, next && next.startsWith("/") && !next.startsWith("//")
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login");
    return;
  }

  if((pathname === "/teacher-accounts" || pathname === "/teacher-accounts.html") && readTeacherSession(req)?.role !== "admin"){
    sendRedirect(res, "/student-dashboard");
    return;
  }

  const requested = routes[pathname] || pathname.replace(/^\//, "");
  const filePath = path.normalize(path.join(publicDir, requested));

  if(!filePath.startsWith(publicDir)){
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try{
    let body = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type = types[ext] || "text/plain; charset=utf-8";

    if(ext === ".html"){
      let html = body.toString("utf8");
      if(requested === "guidance.html"){
        const cases = await readGuidanceCases().catch(()=>[]);
        const renderedRegister = guidanceCaseRegisterHtml(cases);
        html = html
          .replace(/<p id="caseStatusMessage" role="status">[\s\S]*?<\/p>/, renderedRegister.statusHtml)
          .replace(/<div id="caseList" class="case-list"><\/div>/, renderedRegister.listHtml);
        html = html.replace("</head>", `<script>window.__BAKHAW_GUIDANCE_CASES__=${JSON.stringify(cases).replace(/</g,"\\u003c")};</script></head>`);
      }
      if(isPantananHost(host)){
        html = html.replace(/Roadworthy/g, "Pantanan");
      }
      body = Buffer.from(html);
    }

    const extraHeaders = (pathname === "/login" || pathname === "/teacher-login" || pathname === "/teacher-login.html" || pathname === "/offline-reset")
      ? {
        "Pragma":"no-cache",
        "Expires":"0"
      }
      : {};

    send(res, 200, body, type, extraHeaders);
  }catch{
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

function isPantananHost(host){
  return host.includes("foodkiosk2") || host.includes("pos-pantanan");
}

const server = http.createServer(async (req, res)=>{
  try{
    if(await handleApi(req, res)){
      return;
    }

    await serveStatic(req, res);
  }catch(error){
    send(res, 500, JSON.stringify({ ok:false, message:publicErrorMessage(error) }));
  }
});

server.listen(port, ()=>{
  console.log(`Preorder app running at http://localhost:${port}`);
  console.log(`Admin page: http://localhost:${port}/admin`);
  console.log(`Kitchen page: http://localhost:${port}/kitchen`);
});
