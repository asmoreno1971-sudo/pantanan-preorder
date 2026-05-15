const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const publicDir = path.join(root, "public");
const menuPath = process.env.MENU_PATH || path.join(root, "menu.json");
const ordersPath = path.join(root, "orders.json");
const port = Number(process.env.PORT) || 3001;
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const fallbackAdminPassword = "2929";
const semaphoreApiKey = process.env.SEMAPHORE_API_KEY || "";
const semaphoreSenderName = process.env.SEMAPHORE_SENDER_NAME || "";
const sessions = new Set();

if(process.env.NODE_ENV === "production" && adminPassword === "admin123"){
  console.error("Set ADMIN_PASSWORD before running in production.");
  process.exit(1);
}

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
  try{
    return JSON.parse(await fs.readFile(ordersPath, "utf8"));
  }catch{
    return [];
  }
}

async function writeOrders(orders){
  await fs.writeFile(ordersPath, JSON.stringify(orders, null, 2));
}

async function writeJsonFile(filePath, value){
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2));
  await fs.rename(tempPath, filePath);
}

function localOrderDate(){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function isAdmin(req){
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return sessions.has(token);
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

function customerMenu(menu){
  return (Array.isArray(menu) ? menu : []).map(item=>{
    const image = String(item.image || "");

    return {
      id: String(item.id || ""),
      name: String(item.name || "Untitled Product"),
      price: Math.max(0, Number(item.price) || 0),
      theme: String(item.theme || "latte"),
      category: normalizeMenuCategory(item.category),
      image: image.startsWith("http") && image.length < 300 ? image : ""
    };
  });
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
    send(res, 200, await fs.readFile(menuPath, "utf8"));
    return true;
  }

  if(pathname === "/api/menu-lite" && req.method === "GET"){
    const menu = JSON.parse(await fs.readFile(menuPath, "utf8"));
    send(res, 200, JSON.stringify(customerMenu(menu)));
    return true;
  }

  if(pathname === "/products" && req.method === "GET"){
    send(res, 200, await fs.readFile(menuPath, "utf8"));
    return true;
  }

  if(pathname === "/api/admin/login" && req.method === "POST"){
    const body = JSON.parse(await readBody(req) || "{}");

    if(body.password !== adminPassword && body.password !== fallbackAdminPassword){
      send(res, 401, JSON.stringify({ ok:false, message:"Wrong password" }));
      return true;
    }

    const token = crypto.randomBytes(24).toString("hex");
    sessions.add(token);
    send(res, 200, JSON.stringify({ ok:true, token }));
    return true;
  }

  if(pathname === "/api/menu" && req.method === "PUT"){
    if(!isAdmin(req)){
      send(res, 401, JSON.stringify({ ok:false, message:"Admin login required" }));
      return true;
    }

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

    const cleanMenu = menu.map((item, index)=>({
      id: String(item.id || `item-${index + 1}`).replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
      name: String(item.name || "Untitled Product").trim(),
      price: Math.max(0, Number(item.price) || 0),
      theme: String(item.theme || "latte"),
      category: normalizeMenuCategory(item.category),
      image: String(item.image || "")
    }));

    try{
      await writeJsonFile(menuPath, cleanMenu);
    }catch{
      send(res, 500, JSON.stringify({ ok:false, message:"Server could not save products. Your browser backup is still available." }));
      return true;
    }

    send(res, 200, JSON.stringify({ ok:true, menu:cleanMenu }));
    return true;
  }

  if(pathname === "/api/orders" && req.method === "GET"){
    send(res, 200, JSON.stringify(await readOrders()));
    return true;
  }

  if(pathname === "/api/customers.csv" && req.method === "GET"){
    if(!isAdmin(req)){
      send(res, 401, "Admin login required", "text/plain; charset=utf-8");
      return true;
    }

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
    const menu = JSON.parse(await fs.readFile(menuPath, "utf8"));
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

    if(!body.customerName || !body.pickupTime || cleanItems.length === 0){
      send(res, 400, JSON.stringify({ ok:false, message:"Order is incomplete" }));
      return true;
    }

    if(customerContact && !normalizedContact){
      send(res, 400, JSON.stringify({ ok:false, message:"Please enter a valid Philippine mobile number." }));
      return true;
    }

    const pickupTime = String(body.pickupTime);

    if(pickupSlotCount(orders, pickupTime) >= 5){
      send(res, 400, JSON.stringify({ ok:false, message:"That pickup time is already full. Please select the next available time." }));
      return true;
    }

    const total = cleanItems.reduce((sum, item)=>sum + item.subtotal, 0);
    const orderNumber = nextDailyOrderNumber(orders);
    const order = {
      id: Date.now().toString(),
      orderNumber,
      orderDate: localOrderDate(),
      customerName: String(body.customerName).trim().toUpperCase(),
      customerContact:normalizedContact,
      pickupTime,
      status: "Order Sent",
      createdAt: new Date().toISOString(),
      items: cleanItems,
      total
    };

    orders.unshift(order);
    await writeOrders(orders);
    send(res, 200, JSON.stringify({ ok:true, order }));
    return true;
  }

  if((pathname === "/api/pos/transactions" || pathname === "/add-transaction") && req.method === "POST"){
    const body = JSON.parse(await readBody(req) || "{}");
    const menu = JSON.parse(await fs.readFile(menuPath, "utf8"));
    const orders = await readOrders();
    const items = Array.isArray(body.items) ? body.items : [];
    const cleanItems = items
      .map(item=>{
        const product = menu.find(menuItem=>menuItem.id === item.id || menuItem.name === item.product || menuItem.name === item.name);
        const qty = Math.max(0, Number(item.qty) || 0);
        const fallbackName = String(item.product || item.name || "").trim();
        const fallbackPrice = Math.max(0, Number(item.price) || 0);

        if(qty === 0 || (!product && (!fallbackName || fallbackPrice === 0))){
          return null;
        }

        return {
          id: product ? product.id : String(item.id || fallbackName).replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
          name: product ? product.name : fallbackName,
          qty,
          price: product ? product.price : fallbackPrice,
          subtotal: qty * (product ? product.price : fallbackPrice)
        };
      })
      .filter(Boolean);

    if(cleanItems.length === 0){
      send(res, 400, JSON.stringify({ ok:false, message:"No valid POS items" }));
      return true;
    }

    const total = cleanItems.reduce((sum, item)=>sum + item.subtotal, 0);
    const order = {
      id: Date.now().toString(),
      orderNumber: nextDailyOrderNumber(orders),
      orderDate: localOrderDate(),
      customerName: "WALK-IN",
      customerContact: "",
      pickupTime: "POS RW",
      source: "POS RW",
      status: "Paid",
      createdAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      items: cleanItems,
      total
    };

    orders.unshift(order);
    await writeOrders(orders);
    send(res, 200, JSON.stringify({ ok:true, order }));
    return true;
  }

  if((pathname === "/api/pos/cancel-last" || pathname === "/cancel-last") && req.method === "POST"){
    const orders = await readOrders();
    const order = orders.find(item=>item.source === "POS RW" && item.status !== "Cancelled");

    if(!order){
      send(res, 404, JSON.stringify({ ok:false, message:"No POS RW transaction to cancel" }));
      return true;
    }

    order.status = "Cancelled";
    order.cancelledAt = new Date().toISOString();
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
    "/kitchen": "kitchen.html",
    "/pos": "pos.html",
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
