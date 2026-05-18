const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const publicDir = path.join(root, "public");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : root;
const databaseUrl = process.env.DATABASE_URL || "";
const isProduction = process.env.NODE_ENV === "production";
const menuPath = resolveAdminProductsPath();
const ordersPath = path.resolve(process.env.ORDERS_PATH || path.join(dataDir, "orders.json"));
const ordersWatermarkPath = path.resolve(process.env.ORDERS_WATERMARK_PATH || path.join(dataDir, "orders-watermark.json"));
const transactionLedgerPath = path.resolve(process.env.TRANSACTION_LEDGER_PATH || path.join(dataDir, "transaction-ledger.json"));
const port = Number(process.env.PORT) || 3001;
const semaphoreApiKey = process.env.SEMAPHORE_API_KEY || "";
const semaphoreSenderName = process.env.SEMAPHORE_SENDER_NAME || "";
const menuContractVersion = "20260518-admin-canonical-menu";
const allowEmptyOrderStorage = process.env.ALLOW_EMPTY_ORDER_STORAGE === "true";
let cachedMenu = null;
let cachedMenuMtime = 0;
const cachedImages = new Map();
let menuFileReady = null;
let ordersFileReady = null;
let dbPool = null;
let dbReady = null;
const legacyMenuPaths = [...new Set([
  path.join(root, "menu.json"),
  path.join(dataDir, "menu.json"),
  process.env.ADMIN_PRODUCTS_PATH ? path.resolve(process.env.ADMIN_PRODUCTS_PATH) : ""
])].filter(filePath=>filePath && path.resolve(filePath) !== menuPath);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
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

function send(res, status, body, type = "application/json; charset=utf-8"){
  const cacheControl = type.includes("application/json")
    ? "no-store"
    : type.includes("text/html")
      ? "no-store, max-age=0, must-revalidate"
      : type.includes("application/javascript") || type.includes("text/css")
        ? "no-store, max-age=0, must-revalidate"
        : "public, max-age=86400";

  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": cacheControl
  });
  res.end(body);
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
  const pool = await getDbPool();

  if(pool){
    const existing = await pool.query("select value from app_data where key = $1", [key]);

    if(existing.rows.length){
      return existing.rows[0].value;
    }

    if(key === "orders" && isProduction && !allowEmptyOrderStorage){
      throw new Error("Order storage is missing. Refusing to create empty transaction history in production.");
    }

    if(key === "admin-products"){
      return fallbackValue;
    }

    const seed = await readJsonSeed(filePath, fallbackValue);
    await pool.query(
      "insert into app_data (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do nothing",
      [key, JSON.stringify(seed)]
    );
    return seed;
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
  requirePersistentStorageForProduction(key, "write");
  const pool = await getDbPool();

  if(pool){
    await pool.query(
      "insert into app_data (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do update set value = excluded.value, updated_at = now()",
      [key, JSON.stringify(value)]
    );
    return;
  }

  await writeJsonFile(filePath, value);
}

function requirePersistentStorageForProduction(key, operation){
  const protectedKeys = new Set([
    "admin-products",
    "orders",
    "orders-watermark",
    "transaction-ledger"
  ]);

  if(!isProduction || databaseUrl || !protectedKeys.has(key)){
    return;
  }

  if(key === "admin-products"){
    return;
  }

  return;
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

function nextDailyOrderNumber(orders){
  const today = localOrderDate();
  const todaysOrders = orders.filter(order=>order.orderDate === today);
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
  return {
    id: String(item.id || `item-${index + 1}`).replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    name: String(item.name || "Untitled Product").trim(),
    price: Math.max(0, Number(item.price) || 0),
    theme: String(item.theme || "latte"),
    category: normalizeMenuCategory(item.category),
    image: normalizeMenuImage(item.image),
    available: item.available !== false
  };
}

function normalizeMenuImage(image){
  const value = String(image || "").trim();
  return isForbiddenLegacyImage(value) ? "" : value;
}

function isForbiddenLegacyImage(image){
  const value = String(image || "").toLowerCase();
  const forbiddenPatterns = [
    "images.unsplash.com/photo-1499636136210-6f4ee915583e",
    "upload.wikimedia.org/wikipedia/commons/8/8b/bottle_of_water.png",
    "lotusbiscoff.com/sites/default/files/styles/image_style_scale_width_xs/public/2023-10/biscoff%20hero%20image%20classic%20250g.jpg"
  ];

  return forbiddenPatterns.some(pattern=>value.includes(pattern));
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
  return `Your order #${orderNumber} is ready for payment and pickup.`;
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
    send(res, 200, JSON.stringify({
      ok:true,
      menuContractVersion,
      storageMode:storageMode(),
      storagePersistent:Boolean(databaseUrl),
      menuCount:menu.count,
      menuFingerprint:menu.fingerprint,
      orderCount:orders.count,
      transactionLineCount:transactionLines.count,
      transactionCount:transactionLines.transactionCount,
      storageWarning:databaseUrl ? "" : "DATABASE_URL is missing. Admin, Customer, Cashier, and Kitchen are using the same cleaned fallback storage. Render Postgres is still recommended for permanent records."
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

  if(pathname === "/api/menu" && req.method === "GET"){
    const view = url.searchParams.get("view");
    const responseMenu = normalizeMenu(await readMenu());
    res.writeHead(200, {
      "Content-Type":"application/json; charset=utf-8",
      "Cache-Control":"no-store",
      "X-Menu-Source":"admin-persistent-menu",
      "X-Menu-File":"admin-products",
      "X-Menu-Storage":storageMode(),
      "X-Menu-Version":menuContractVersion,
      "X-Menu-Fingerprint":menuFingerprint(responseMenu),
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

    const cleanMenu = normalizeMenu(menu);

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

    send(res, 200, JSON.stringify({ ok:true, menu:cleanMenu }));
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
    const cleanItems = items
      .map(item=>{
        const product = menu.find(menuItem=>menuItem.id === item.id);
        const qty = Math.max(0, Number(item.qty) || 0);

        if(!product || qty === 0){
          return null;
        }

        return {
          id: product.id,
          name: product.name,
          qty,
          price: product.price,
          subtotal: qty * product.price
        };
      })
      .filter(Boolean);

    const customerContact = String(body.customerContact || body.customerMessenger || "").trim();
    const normalizedContact = normalizePhilippineMobileNumber(customerContact);
    const source = String(body.source || "customer").trim().toLowerCase() === "cashier" ? "cashier" : "";
    const isCashierOrder = source === "cashier";

    if(!body.customerName || !body.pickupTime || cleanItems.length === 0){
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
    const orderNumber = nextDailyOrderNumber(orders);
    const order = {
      id: Date.now().toString(),
      orderNumber,
      orderDate: localOrderDate(),
      customerName: String(body.customerName).trim().toUpperCase(),
      customerContact:normalizedContact,
      pickupTime,
      status: isCashierOrder ? "Done" : "Order Sent",
      source,
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
  const routes = {
    "/": "index.html",
    "/admin": "admin.html",
    "/cashier": "cashier.html",
    "/kitchen": "kitchen.html",
    "/sales": "sales.html",
    "/transaction": "transactions.html",
    "/transactions": "transactions.html",
    "/qr": "qr.html"
  };

  const requested = routes[pathname] || pathname.replace(/^\//, "");
  const filePath = path.normalize(path.join(publicDir, requested));

  if(!filePath.startsWith(publicDir)){
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  try{
    const body = await fs.readFile(filePath);
    send(res, 200, body, types[path.extname(filePath)] || "text/plain; charset=utf-8");
  }catch{
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

const server = http.createServer(async (req, res)=>{
  try{
    if(await handleApi(req, res)){
      return;
    }

    await serveStatic(req, res);
  }catch(error){
    send(res, 500, JSON.stringify({ ok:false, message:error.message }));
  }
});

server.listen(port, ()=>{
  console.log(`Preorder app running at http://localhost:${port}`);
  console.log(`Admin page: http://localhost:${port}/admin`);
  console.log(`Kitchen page: http://localhost:${port}/kitchen`);
});
