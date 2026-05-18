const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const publicDir = path.join(root, "public");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : root;
const menuPath = path.resolve(process.env.ADMIN_PRODUCTS_PATH || path.join(dataDir, "admin-products.json"));
const ordersPath = path.resolve(process.env.ORDERS_PATH || path.join(dataDir, "orders.json"));
const databaseUrl = process.env.DATABASE_URL || "";
const port = Number(process.env.PORT) || 3001;
const semaphoreApiKey = process.env.SEMAPHORE_API_KEY || "";
const semaphoreSenderName = process.env.SEMAPHORE_SENDER_NAME || "";
let cachedMenu = null;
let cachedMenuMtime = 0;
const cachedImages = new Map();
let menuFileReady = null;
let ordersFileReady = null;
let dbPool = null;
let dbReady = null;
const legacyMenuPaths = [...new Set([
  path.join(root, "menu.json"),
  path.join(dataDir, "menu.json")
])].filter(filePath=>path.resolve(filePath) !== menuPath);

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

function send(res, status, body, type = "application/json; charset=utf-8"){
  const cacheControl = type.includes("application/json")
    ? "no-store"
    : type.includes("text/html")
      ? "no-cache"
      : type.includes("application/javascript") || type.includes("text/css")
        ? "no-cache, max-age=0, must-revalidate"
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

  return orders;
}

async function writeOrders(orders){
  if(!Array.isArray(orders)){
    throw new Error("Orders write blocked: invalid order data.");
  }

  await writeDataRecord("orders", ordersPath, orders);
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

    const seed = await readJsonSeed(filePath, fallbackValue);
    const seededValue = key === "admin-products" ? normalizeMenu(seed) : seed;
    await pool.query(
      "insert into app_data (key, value, updated_at) values ($1, $2::jsonb, now()) on conflict (key) do nothing",
      [key, JSON.stringify(seededValue)]
    );
    return seededValue;
  }

  await ensureJsonFile(filePath, null, fallbackValue);

  try{
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  }catch(error){
    throw new Error(`${path.basename(filePath)} could not be read safely: ${error.message}`);
  }
}

async function writeDataRecord(key, filePath, value){
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
      if(!databaseUrl){
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
    ordersFileReady = databaseUrl ? Promise.resolve() : ensureJsonFile(ordersPath, null, []);
  }

  return ordersFileReady;
}

function clearMenuCache(){
  cachedMenu = null;
  cachedMenuMtime = 0;
  cachedImages.clear();
}

async function readMenu(){
  await ensureMenuFile();

  if(databaseUrl){
    let storedMenu = await readDataRecord("admin-products", menuPath, []);

    if(!Array.isArray(storedMenu) || storedMenu.length === 0){
      const seedMenu = normalizeMenu(await readJsonSeed(menuPath, []));

      if(seedMenu.length){
        storedMenu = seedMenu;
        await writeDataRecord("admin-products", menuPath, seedMenu);
      }
    }

    cachedMenu = normalizeMenu(storedMenu);

    if(menuRecordChanged(storedMenu, cachedMenu)){
      await writeDataRecord("admin-products", menuPath, cachedMenu);
    }

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

  if(menuRecordChanged(menuData, cachedMenu)){
    await writeDataRecord("admin-products", menuPath, cachedMenu);
  }

  cachedMenuMtime = stats.mtimeMs;
  cachedImages.clear();
  return cachedMenu;
}

function menuRecordChanged(originalMenu, cleanMenu){
  return JSON.stringify(Array.isArray(originalMenu) ? originalMenu : []) !== JSON.stringify(cleanMenu);
}

function localOrderDate(){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalDate(date){
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  const rows = [];

  orders
    .filter(order=>orderCountsAsSale(order) && orderSalesDate(order) === date)
    .forEach(order=>{
      const soldAt = orderSoldAt(order);
      const orderNumber = Number(order.orderNumber) || 0;

      (Array.isArray(order.items) ? order.items : []).forEach(item=>{
        const name = String(item.name || item.product || "Item").trim();
        const qty = Math.max(0, Number(item.qty) || 0);
        const subtotal = Number(item.subtotal) || qty * (Number(item.price) || 0);

        if(!name || !qty){
          return;
        }

        rows.push({
          name,
          soldAt,
          orderNumber,
          frequency:qty,
          total:subtotal
        });
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
  const period = ["day", "week", "month", "all"].includes(options.period) ? options.period : "day";
  const date = options.date || localOrderDate();
  const range = period === "all" ? null : periodRange(date, period);
  const rows = [];

  orders.forEach(order=>{
    const transactionAt = orderTransactionAt(order);
    const transactionDate = new Date(transactionAt);

    if(range && (Number.isNaN(transactionDate.getTime()) || transactionDate < range.start || transactionDate >= range.end)){
      return;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const transactionTotal = Number(order.total) || items.reduce((sum, item)=>{
      const qty = Math.max(0, Number(item.qty) || 0);
      return sum + (Number(item.subtotal) || qty * (Number(item.price) || 0));
    }, 0);

    items.forEach(item=>{
      const qty = Math.max(0, Number(item.qty) || 0);
      const price = Math.max(0, Number(item.price) || 0);
      const amount = Number(item.subtotal) || qty * price;

      rows.push({
        orderId:order.id,
        orderNumber:Number(order.orderNumber) || 0,
        timestamp:transactionAt,
        product:String(item.name || item.product || "Item").trim(),
        quantity:qty,
        amount,
        transactionTotal,
        source:order.source === "cashier" ? "Cashier" : "Customer",
        status:order.status || ""
      });
    });
  });

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
    }catch{
      send(res, 500, JSON.stringify({ ok:false, message:"Server could not save products. Your browser backup is still available." }));
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
    const orders = await readOrders();
    send(res, 200, JSON.stringify({ ok:true, report:dailySalesReport(orders, date) }));
    return true;
  }

  if(pathname === "/api/transactions" && req.method === "GET"){
    const orders = await readOrders();
    send(res, 200, JSON.stringify({
      ok:true,
      report:transactionLedger(orders, {
        date:url.searchParams.get("date") || localOrderDate(),
        period:url.searchParams.get("period") || "day"
      })
    }));
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
