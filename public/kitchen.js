let seenOrderIds = new Set();
let printedOrderIds = loadPrintedOrderIds();
let queuedPrintOrderIds = new Set();
let printQueue = [];
let printInProgress = false;
let kitchenPrinterPort = null;
let kitchenBluetoothDevice = null;
let kitchenBluetoothCharacteristic = null;
let kitchenWakeLock = null;
let printerReconnectInProgress = false;
let soundEnabled = localStorage.getItem("kitchenSoundEnabled") === "true";
let audioContext;
let currentOrders = [];
let kitchenToken = "page-auth";
const printedOrdersStorageKey = "kitchenPrintedOrderIds:v20260523-autoprint-recover";
const bluetoothPrinterServices = [
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "000018f0-0000-1000-8000-00805f9b34fb"
];
const kitchenLoginPanel = document.getElementById("kitchenLoginPanel");
const kitchenPanel = document.getElementById("kitchenPanel");
const kitchenPassword = document.getElementById("kitchenPassword");
const kitchenLoginStatus = document.getElementById("kitchenLoginStatus");
const soundBtn = document.getElementById("soundBtn");
const soundStatus = document.getElementById("soundStatus");
const printerBtn = document.getElementById("printerBtn");
const printerStatus = document.getElementById("printerStatus");

async function loginKitchen(){
  if(kitchenPassword.value !== "1111"){
    kitchenLoginStatus.innerText = "Wrong password";
    return;
  }

  kitchenToken = "page-auth";
  showKitchen();
  await enableSound();
  await loadOrders();
}

function showKitchen(){
  kitchenLoginPanel.classList.add("hidden");
  kitchenPanel.classList.remove("hidden");
  keepKitchenAwake();
  restoreKitchenPrinter();
}

async function loadOrders(){
  if(!kitchenToken){
    return;
  }

  const res = await fetch("/api/orders?source=customer");
  const orders = await res.json();
  currentOrders = orders;
  notifyNewOrders(orders);
  renderOrders(orders);
}

function enableSound(){
  audioContext = audioContext || new AudioContext();
  return audioContext.resume().then(()=>{
    soundEnabled = true;
    localStorage.setItem("kitchenSoundEnabled", "true");
    if(soundBtn){
      soundBtn.innerText = "Sound On";
      soundBtn.classList.add("sound-on");
    }
    if(soundStatus){
      soundStatus.innerText = "Alerts enabled";
    }
    playAlertSound();
  }).catch(()=>{
    if(soundStatus){
      soundStatus.innerText = "Tap Enable Sound once";
    }
  });
}

function showSavedSoundState(){
  if(soundEnabled){
    if(soundBtn){
      soundBtn.innerText = "Sound On";
      soundBtn.classList.add("sound-on");
    }
    if(soundStatus){
      soundStatus.innerText = "Alerts enabled";
    }
  }
}

function notifyNewOrders(orders){
  const activeOrders = orders.filter(order=>!orderIsComplete(order));
  const newOrders = activeOrders.filter(order=>!seenOrderIds.has(order.id));
  const unprintedOrders = activeOrders.filter(order=>!printedOrderIds.has(order.id));

  if(seenOrderIds.size && newOrders.length){
    playAlertSound();
  }

  unprintedOrders.forEach(queueKitchenPrint);
  activeOrders.forEach(order=>seenOrderIds.add(order.id));
}

function loadPrintedOrderIds(){
  try{
    localStorage.removeItem("kitchenPrintedOrderIds");
    const saved = JSON.parse(localStorage.getItem(printedOrdersStorageKey) || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  }catch(err){
    return new Set();
  }
}

function savePrintedOrderIds(){
  const recentIds = Array.from(printedOrderIds).slice(-250);
  printedOrderIds = new Set(recentIds);
  localStorage.setItem(printedOrdersStorageKey, JSON.stringify(recentIds));
}

function queueKitchenPrint(order){
  if(!order || printedOrderIds.has(order.id) || queuedPrintOrderIds.has(order.id)){
    return;
  }

  queuedPrintOrderIds.add(order.id);
  printQueue.push(order);
  runPrintQueue();
}

async function runPrintQueue(){
  if(printInProgress || !printQueue.length){
    return;
  }

  printInProgress = true;
  const order = printQueue.shift();
  const directPrinted = await printKitchenReceiptDirect(order);

  queuedPrintOrderIds.delete(order.id);

  if(directPrinted){
    printedOrderIds.add(order.id);
    savePrintedOrderIds();
  }else{
    updatePrinterStatus("Connect printer for auto-print", false);
  }

  setTimeout(()=>{
    printInProgress = false;
    runPrintQueue();
  }, 1400);
}

async function restoreKitchenPrinter(){
  if(printerReconnectInProgress){
    return;
  }

  printerReconnectInProgress = true;
  const serialRestored = await restoreSerialPrinter();

  if(serialRestored){
    printerReconnectInProgress = false;
    return;
  }

  const bluetoothRestored = await restoreBluetoothPrinter();

  if(bluetoothRestored){
    printerReconnectInProgress = false;
    return;
  }

  updatePrinterStatus(printerSupportMessage(), false);
  printerReconnectInProgress = false;
}

async function connectKitchenPrinter(){
  const serialConnected = await connectSerialPrinter();

  if(serialConnected){
    return;
  }

  const bluetoothConnected = await connectBluetoothPrinter();

  if(bluetoothConnected){
    return;
  }

  updatePrinterStatus("Printer not connected", false);
}

async function restoreSerialPrinter(){
  if(!("serial" in navigator)){
    return false;
  }

  try{
    const ports = await navigator.serial.getPorts();
    if(!ports.length){
      return false;
    }

    kitchenPrinterPort = ports[0];
    await openKitchenPrinterPort();
    updatePrinterStatus("Serial printer connected", true);
    await loadOrders();
    return true;
  }catch(err){
    return false;
  }
}

async function connectSerialPrinter(){
  if(!("serial" in navigator)){
    return false;
  }

  try{
    kitchenPrinterPort = await navigator.serial.requestPort();
    await openKitchenPrinterPort();
    updatePrinterStatus("Serial printer connected", true);
    await loadOrders();
    return true;
  }catch(err){
    return false;
  }
}

async function restoreBluetoothPrinter(){
  if(!("bluetooth" in navigator) || typeof navigator.bluetooth.getDevices !== "function"){
    return false;
  }

  try{
    const devices = await navigator.bluetooth.getDevices();
    const device = devices.find(item=>/kprinter|printer|pos58|5802/i.test(item.name || ""));

    if(!device){
      return false;
    }

    await openBluetoothPrinter(device);
    return true;
  }catch(err){
    return false;
  }
}

async function connectBluetoothPrinter(){
  if(!("bluetooth" in navigator)){
    return false;
  }

  try{
    const device = await navigator.bluetooth.requestDevice({
      filters:[
        { namePrefix:"KPrinter" },
        { namePrefix:"KPrinter_dac5" },
        { namePrefix:"JK" },
        { namePrefix:"POS" }
      ],
      optionalServices:bluetoothPrinterServices
    });

    await openBluetoothPrinter(device);
    return true;
  }catch(err){
    console.warn("Bluetooth printer connection failed", err);
    return false;
  }
}

async function openBluetoothPrinter(device){
  kitchenBluetoothDevice = device;
  const server = await device.gatt.connect();

  for(const serviceId of bluetoothPrinterServices){
    try{
      const service = await server.getPrimaryService(serviceId);
      const characteristics = await service.getCharacteristics();
      const writable = characteristics.find(characteristic=>
        characteristic.properties.write || characteristic.properties.writeWithoutResponse
      );

      if(writable){
        kitchenBluetoothCharacteristic = writable;
        updatePrinterStatus(`Bluetooth printer connected: ${device.name || "Printer"}`, true);
        device.addEventListener("gattserverdisconnected", function(){
          kitchenBluetoothCharacteristic = null;
          updatePrinterStatus("Printer disconnected. Reconnecting...", false);
          setTimeout(restoreKitchenPrinter, 1200);
        }, { once:true });
        await loadOrders();
        return;
      }
    }catch(err){
      // Try the next common printer service.
    }
  }

  throw new Error("No writable Bluetooth printer service found.");
}

function printerSupportMessage(){
  if("bluetooth" in navigator){
    return "Tap Connect Printer";
  }

  if("serial" in navigator){
    return "Tap Connect Printer";
  }

  return "Use Chrome/Edge with Bluetooth";
}

async function keepKitchenAwake(){
  if(!("wakeLock" in navigator) || kitchenWakeLock){
    return;
  }

  try{
    kitchenWakeLock = await navigator.wakeLock.request("screen");
    kitchenWakeLock.addEventListener("release", function(){
      kitchenWakeLock = null;
    });
  }catch(err){
    // Wake lock is helpful on phones, but printing can still work without it.
  }
}

async function openKitchenPrinterPort(){
  if(!kitchenPrinterPort || kitchenPrinterPort.readable || kitchenPrinterPort.writable){
    return;
  }

  await kitchenPrinterPort.open({
    baudRate:9600,
    dataBits:8,
    stopBits:1,
    parity:"none",
    flowControl:"none"
  });
}

function updatePrinterStatus(message, connected){
  if(printerStatus){
    printerStatus.innerText = message;
  }

  if(printerBtn){
    printerBtn.innerText = connected ? "Printer Connected" : "Connect Printer";
    printerBtn.classList.toggle("connected", Boolean(connected));
  }
}

async function printKitchenReceiptDirect(order){
  const bytes = kitchenReceiptBytes(order);
  const serialPrinted = await printKitchenReceiptSerial(bytes);

  if(serialPrinted){
    return true;
  }

  return printKitchenReceiptBluetooth(bytes);
}

async function printKitchenReceiptSerial(bytes){
  if(!kitchenPrinterPort){
    return false;
  }

  let writer;
  try{
    await openKitchenPrinterPort();

    if(!kitchenPrinterPort.writable){
      return false;
    }

    writer = kitchenPrinterPort.writable.getWriter();
    await writer.write(bytes);
    updatePrinterStatus("Printed to KPrinter", true);
    return true;
  }catch(err){
    console.warn("Serial kitchen print failed", err);
    return false;
  }finally{
    if(writer){
      writer.releaseLock();
    }
  }
}

async function printKitchenReceiptBluetooth(bytes){
  if(!kitchenBluetoothCharacteristic){
    return false;
  }

  try{
    if(kitchenBluetoothDevice && kitchenBluetoothDevice.gatt && !kitchenBluetoothDevice.gatt.connected){
      await openBluetoothPrinter(kitchenBluetoothDevice);
    }

    const chunkSize = 20;
    for(let offset = 0; offset < bytes.length; offset += chunkSize){
      const chunk = bytes.slice(offset, offset + chunkSize);

      if(kitchenBluetoothCharacteristic.properties.writeWithoutResponse){
        await kitchenBluetoothCharacteristic.writeValueWithoutResponse(chunk);
      }else{
        await kitchenBluetoothCharacteristic.writeValue(chunk);
      }

      await sleep(35);
    }

    updatePrinterStatus("Printed to Bluetooth printer", true);
    return true;
  }catch(err){
    console.warn("Bluetooth kitchen print failed", err);
    updatePrinterStatus("Printer needs reconnect", false);
    return false;
  }
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve, ms));
}

function kitchenReceiptBytes(order){
  const encoder = new TextEncoder();
  const orderNumber = String(order.orderNumber || order.id.slice(-3)).padStart(3, "0");
  const created = order.createdAt
    ? new Date(order.createdAt).toLocaleString([], { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })
    : "";
  const lines = [
    "Food Kiosk - Roadworthy",
    `ORDER #${orderNumber}`,
    `Customer: ${order.customerName || "Walk-in"}`,
    `Pickup: ${order.pickupTime || ""}`,
    `Received: ${created}`,
    "------------------------------",
    ...(order.items || []).map(item=>{
      const name = String(item.name || "");
      const amount = `P${item.subtotal || 0}`;
      return `${item.qty || 0}x ${name}`.padEnd(Math.max(1, 30 - amount.length), " ") + amount;
    }),
    "------------------------------",
    receiptLine("TOTAL", `P${order.total || 0}`),
    "",
    "",
    "",
    "",
    "",
    ""
  ];
  const text = lines.join("\r\n");
  const cut = new Uint8Array([29, 86, 66, 0]);
  const init = new Uint8Array([27, 64]);
  const payload = encoder.encode(text);
  const bytes = new Uint8Array(init.length + payload.length + cut.length);

  bytes.set(init, 0);
  bytes.set(payload, init.length);
  bytes.set(cut, init.length + payload.length);

  return bytes;
}

function receiptLine(left, right){
  const lineWidth = 30;
  const leftText = String(left || "");
  const rightText = String(right || "");
  const spaceCount = Math.max(1, lineWidth - leftText.length - rightText.length);
  return leftText + " ".repeat(spaceCount) + rightText;
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function playAlertSound(){
  if(!soundEnabled || !audioContext){
    return;
  }

  const now = audioContext.currentTime;
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.setValueAtTime(-24, now);
  compressor.knee.setValueAtTime(20, now);
  compressor.ratio.setValueAtTime(8, now);
  compressor.attack.setValueAtTime(.003, now);
  compressor.release.setValueAtTime(.18, now);
  compressor.connect(audioContext.destination);

  const pattern = [0, .16, .32, .62, .78, .94];

  pattern.forEach((patternOffset, index)=>{
    playAlertTone(now + patternOffset, index, compressor);
  });
}

function playAlertTone(startTime, index, destination){
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(index % 2 ? 1040 : 760, startTime);
    gain.gain.setValueAtTime(.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(.95, startTime + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, startTime + .16);

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + .18);
}

function renderOrders(orders){
  const customerOrders = orders.filter(order=>!order.source && order.status !== "Cancelled");
  const activeOrders = customerOrders.filter(order=>!orderIsComplete(order));
  const completedOrders = customerOrders.filter(order=>orderIsComplete(order));
  const doneOrders = completedOrders.slice(0, 8);
  const newOrders = activeOrders.filter(order=>order.status === "Order Sent").length;
  const preparingOrders = activeOrders.filter(order=>order.status === "Preparing Order").length;
  const finishedOrders = customerOrders.filter(order=>order.status === "Done").length;

  ordersContainer.innerHTML = `
    <div class="queue-stats">
      <div><span>New</span><strong>${newOrders}</strong></div>
      <div><span>Preparing</span><strong>${preparingOrders}</strong></div>
      <div><span>Done Today</span><strong>${finishedOrders}</strong></div>
    </div>

    <section class="queue-section">
      <div class="queue-heading">
        <h4>Received Orders</h4>
        <span>${activeOrders.length} active</span>
      </div>
      ${ordersTable(activeOrders, false)}
    </section>

    <section class="queue-section recent-done-section">
      <div class="queue-heading">
        <h4>Recently Done</h4>
        <span>${doneOrders.length} shown</span>
      </div>
      ${ordersTable(doneOrders, true)}
    </section>
  `;
}

function ordersTable(orders, done){
  if(!orders.length){
    return emptyState(done ? "No completed orders" : "No active orders");
  }

  return `
    <div class="orders-table-wrap ${done ? "done-list" : ""}">
      <table class="orders-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Status</th>
            <th>Customer</th>
            <th>Pickup Time</th>
            <th>Items</th>
            <th>Total</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order=>orderRow(order)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function orderRow(order){
  const created = new Date(order.createdAt).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
  const displayNumber = String(order.orderNumber || order.id.slice(-3)).padStart(3, "0");
  const items = order.items.map(item=>`
    <div class="table-item">
      <strong>${item.qty}x</strong>
      <span>${item.name}</span>
      <span>P${item.subtotal}</span>
    </div>
  `).join("");
  const actionButton = kitchenActionButton(order);

  return `
    <tr class="${order.status === "Order Sent" ? "new-order-row" : ""}">
      <td><strong class="order-id">#${displayNumber}</strong><span class="order-meta">Sent ${created}</span></td>
      <td>${statusBadge(order.status)}</td>
      <td><strong>${order.customerName}</strong><span class="order-meta">${order.customerContact || order.customerMessenger || order.customerPhone || "No contact"}</span></td>
      <td>${order.pickupTime}</td>
      <td><div class="table-items">${items}</div></td>
      <td class="table-total">P${order.total}</td>
      <td class="table-actions">${actionButton}</td>
    </tr>
  `;
}

function statusBadge(status){
  const label = status || "Order Sent";
  const className = label === "Preparing Order"
    ? "status-preparing-badge"
    : label === "Ready for Payment and Pickup" || label === "Done"
      ? "status-ready-badge"
      : "status-new-badge";

  return `<span class="queue-status ${className}">${label}</span>`;
}

function emptyState(message){
  return `<div class="empty-state">${message}</div>`;
}

function kitchenActionButton(order){
  if(order.status === "Done"){
    return `<div class="order-status">Done</div>`;
  }

  if(order.status === "Ready for Payment and Pickup"){
    return `<button class="kitchen-action-btn notify-btn final-done-btn" onclick="markPickedUp('${order.id}')">Your order is ready for payment/pickup</button>`;
  }

  if(order.status === "Preparing Order"){
    return `<button class="kitchen-action-btn prepare-btn active" data-prepare-id="${order.id}" onclick="markDone('${order.id}')">${preparingLabel(order)}</button>`;
  }

  return `<button class="kitchen-action-btn prepare-btn" onclick="markPreparing('${order.id}')">Prepare Order</button>`;
}

function preparingLabel(order){
  if(order.status !== "Preparing Order"){
    return "Prepare Order";
  }

  return `Preparing Order: ${elapsedPreparingTime(order)}`;
}

function elapsedPreparingTime(order){
  const startedAt = new Date(order.preparingAt || order.createdAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updatePreparingTimers(){
  currentOrders
    .filter(order=>order.status === "Preparing Order")
    .forEach(order=>{
      const button = document.querySelector(`[data-prepare-id="${order.id}"]`);

      if(button){
        button.innerText = preparingLabel(order);
      }
    });
}

async function markDone(id){
  await finishOrder(id);
  await loadOrders();
}

async function markPickedUp(id){
  await fetch(`/api/orders/${id}/complete`, { method:"POST" });
  await loadOrders();
}

function orderIsComplete(order){
  return order.status === "Done";
}

async function markPreparing(id){
  const order = currentOrders.find(item=>item.id === id);

  if(order && order.status === "Preparing Order"){
    return;
  }

  await fetch(`/api/orders/${id}/preparing`, { method:"POST" });
  await loadOrders();
}

async function messageCustomer(id){
  const res = await fetch(`/api/orders/${id}`);
  const data = await res.json();

  if(!data.ok){
    return;
  }

  const order = data.order;
  const message = customerMessage(order);
  const contact = order.customerContact || order.customerMessenger || order.customerPhone || "";

  messageContact.innerText = contact
    ? `Customer contact: ${contact}`
    : "No contact was saved for this order.";
  messageText.value = message;
  messageModal.classList.add("show");
}

async function notifyCustomerReady(id){
  await finishOrder(id);
  await loadOrders();
}

async function finishOrder(id){
  await fetch(`/api/orders/${id}/done`, { method:"POST" });
}

function customerMessage(order){
  const orderNumber = String(order.orderNumber || 0).padStart(3, "0");
  return `Your order #${orderNumber} is ready for payment/pickup.`;
}

function closeMessageModal(){
  messageModal.classList.remove("show");
}

document.addEventListener("keydown", function(e){
  if(e.key === "Enter" && messageModal.classList.contains("show")){
    e.preventDefault();
    closeMessageModal();
  }
});

async function copyCustomerMessage(){
  messageText.select();
  await copyText(messageText.value);
}

async function copyText(text){
  if(navigator.clipboard){
    await navigator.clipboard.writeText(text);
  }else{
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

kitchenPassword.addEventListener("keydown", function(e){
  if(e.key === "Enter"){
    loginKitchen();
  }
});

if(kitchenToken){
  showKitchen();
  showSavedSoundState();
  enableSound();
  loadOrders();
}

setInterval(loadOrders, 5000);
setInterval(function(){
  if(kitchenPanel && !kitchenPanel.classList.contains("hidden") && !kitchenPrinterPort && !kitchenBluetoothCharacteristic){
    restoreKitchenPrinter();
  }
}, 15000);
setInterval(updatePreparingTimers, 1000);

document.addEventListener("visibilitychange", function(){
  if(document.visibilityState === "visible"){
    keepKitchenAwake();
    restoreKitchenPrinter();
    loadOrders();
  }
});

window.addEventListener("focus", function(){
  keepKitchenAwake();
  restoreKitchenPrinter();
  loadOrders();
});
