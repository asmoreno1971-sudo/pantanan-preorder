let seenOrderIds = new Set();
let soundEnabled = localStorage.getItem("kitchenSoundEnabled") === "true";
let audioContext;
let currentOrders = [];
let kitchenToken = localStorage.getItem("kitchenToken") || "";
const kitchenLoginPanel = document.getElementById("kitchenLoginPanel");
const kitchenPanel = document.getElementById("kitchenPanel");
const kitchenPassword = document.getElementById("kitchenPassword");
const kitchenLoginStatus = document.getElementById("kitchenLoginStatus");

async function loginKitchen(){
  const res = await fetch("/api/admin/login", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ password:kitchenPassword.value })
  });
  const data = await res.json();

  if(!data.ok){
    kitchenLoginStatus.innerText = "Wrong password";
    return;
  }

  kitchenToken = data.token;
  localStorage.setItem("kitchenToken", kitchenToken);
  showKitchen();
  await enableSound();
  await loadOrders();
}

function showKitchen(){
  kitchenLoginPanel.classList.add("hidden");
  kitchenPanel.classList.remove("hidden");
}

async function loadOrders(){
  if(!kitchenToken){
    return;
  }

  const res = await fetch("/api/orders");
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
    soundBtn.innerText = "Sound On";
    soundBtn.classList.add("sound-on");
    soundStatus.innerText = "Alerts enabled";
    playAlertSound();
  }).catch(()=>{
    soundStatus.innerText = "Tap Enable Sound once";
  });
}

function showSavedSoundState(){
  if(soundEnabled){
    soundBtn.innerText = "Sound On";
    soundBtn.classList.add("sound-on");
    soundStatus.innerText = "Alerts enabled";
  }
}

function notifyNewOrders(orders){
  const activeOrders = orders.filter(order=>!orderIsComplete(order));
  const newOrders = activeOrders.filter(order=>!seenOrderIds.has(order.id));

  if(seenOrderIds.size && newOrders.length){
    playAlertSound();
  }

  activeOrders.forEach(order=>seenOrderIds.add(order.id));
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

  for(let repeat = 0; repeat < 2; repeat += 1){
    pattern.forEach((patternOffset, index)=>{
      playAlertTone(now + repeat * 1.25 + patternOffset, index, compressor);
    });
  }
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
  const customerOrders = orders.filter(order=>order.source !== "POS RW" && order.status !== "Cancelled");
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
            <th>Delivery Time</th>
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
  const messageButton = order.customerContact ? notifyButton(order) : readyForPickupButton(order);
  const doneButton = order.status === "Ready for Payment and Pickup"
    ? `<button class="kitchen-action-btn notify-btn final-done-btn" onclick="markPickedUp('${order.id}')">Done</button>`
    : order.status === "Done"
      ? `<div class="order-status">Done</div>`
    : `
      <div class="kitchen-actions">
        <div class="workflow-actions">
          <button class="kitchen-action-btn prepare-btn ${order.status === "Preparing Order" ? "active" : ""}" data-prepare-id="${order.id}" onclick="markPreparing('${order.id}')">${preparingLabel(order)}</button>
        </div>
        <div class="notify-actions">
          ${messageButton}
        </div>
      </div>
    `;

  return `
    <tr class="${order.status === "Order Sent" ? "new-order-row" : ""}">
      <td><strong class="order-id">#${displayNumber}</strong><span class="order-meta">Sent ${created}</span></td>
      <td>${statusBadge(order.status)}</td>
      <td><strong>${order.customerName}</strong><span class="order-meta">${order.customerContact || order.customerMessenger || order.customerPhone || "No contact"}</span></td>
      <td>${order.pickupTime}</td>
      <td><div class="table-items">${items}</div></td>
      <td class="table-total">P${order.total}</td>
      <td class="table-actions">${doneButton}</td>
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

function notifyButton(order){
  const canNotify = order.status === "Preparing Order";
  const disabled = canNotify ? "" : "disabled";
  const label = canNotify ? "DONE. Notify Customer." : "Prepare First";

  return `<button class="kitchen-action-btn notify-btn" ${disabled} onclick="notifyCustomerReady('${order.id}')">${label}</button>`;
}

function readyForPickupButton(order){
  const canFinish = order.status === "Preparing Order";
  const disabled = canFinish ? "" : "disabled";

  return `<button class="kitchen-action-btn notify-btn" ${disabled} onclick="markDone('${order.id}')">Order Ready for Payment/Pickup</button>`;
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
  return order.status === "Ready for Payment and Pickup" || order.status === "Done";
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
  const res = await fetch(`/api/orders/${id}`);
  const data = await res.json();

  if(!data.ok){
    return;
  }

  const order = data.order;
  const messageTextValue = customerMessage(order);
  await copyText(messageTextValue);
  await finishOrder(id);
  messageContact.innerText = `Customer mobile: ${order.customerContact || "No contact"}`;
  messageText.value = messageTextValue;
  messageModal.classList.add("show");
  await loadOrders();
}

async function finishOrder(id){
  await fetch(`/api/orders/${id}/done`, { method:"POST" });
}

function customerMessage(order){
  const orderNumber = String(order.orderNumber || 0).padStart(3, "0");
  return `Your order #${orderNumber} is ready for payment and pickup.`;
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
setInterval(updatePreparingTimers, 1000);
