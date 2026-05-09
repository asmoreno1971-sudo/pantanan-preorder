let seenOrderIds = new Set();
let soundEnabled = false;
let audioContext;
let currentOrders = [];

async function loadOrders(){
  const res = await fetch("/api/orders");
  const orders = await res.json();
  currentOrders = orders;
  notifyNewOrders(orders);
  renderOrders(orders);
}

function enableSound(){
  audioContext = audioContext || new AudioContext();
  audioContext.resume().then(()=>{
    soundEnabled = true;
    soundBtn.innerText = "Sound On";
    soundBtn.classList.add("sound-on");
    soundStatus.innerText = "Alerts enabled";
    playAlertSound();
  });
}

function notifyNewOrders(orders){
  const activeOrders = orders.filter(order=>order.status !== "Ready for Payment and Pickup");
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

  [0, .16, .32, .62, .78, .94].forEach((offset, index)=>{
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(index % 2 ? 1040 : 760, now + offset);
    gain.gain.setValueAtTime(.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(.95, now + offset + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .16);

    oscillator.connect(gain);
    gain.connect(compressor);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + .18);
  });
}

function renderOrders(orders){
  const activeOrders = orders.filter(order=>order.status !== "Ready for Payment and Pickup");
  const doneOrders = orders.filter(order=>order.status === "Ready for Payment and Pickup").slice(0, 6);

  ordersContainer.innerHTML = `
    <section>
      <h4>Preparing <span>${activeOrders.length}</span></h4>
      ${ordersTable(activeOrders, false)}
    </section>

    <section>
      <h4>Done <span>${doneOrders.length}</span></h4>
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
            <th>Customer</th>
            <th>Pickup</th>
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
  const messageButton = order.customerContact
    ? notifyButton(order)
    : `<button class="kitchen-action-btn" onclick="messageCustomer('${order.id}')">No Valid Number</button>`;
  const doneButton = order.status === "Ready for Payment and Pickup"
    ? `<div class="order-status">Ready for payment and pickup</div>`
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
    <tr>
      <td><strong class="order-id">#${displayNumber}</strong><span class="order-meta">Sent ${created}</span></td>
      <td><strong>${order.customerName}</strong><span class="order-meta">${order.customerContact || order.customerMessenger || order.customerPhone || "No contact"}</span></td>
      <td>${order.pickupTime}</td>
      <td><div class="table-items">${items}</div></td>
      <td class="table-total">P${order.total}</td>
      <td class="table-actions">${doneButton}</td>
    </tr>
  `;
}

function emptyState(message){
  return `<div class="empty-state">${message}</div>`;
}

function notifyButton(order){
  const canNotify = order.status === "Preparing Order";
  const disabled = canNotify ? "" : "disabled";
  const label = canNotify ? "Notify Customer" : "Prepare First";

  return `<button class="kitchen-action-btn notify-btn" ${disabled} onclick="notifyCustomerReady('${order.id}')">${label}</button>`;
}

function preparingLabel(order){
  if(order.status !== "Preparing Order"){
    return "Preparing Order";
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

async function markPreparing(id){
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

loadOrders();
setInterval(loadOrders, 5000);
setInterval(updatePreparingTimers, 1000);
