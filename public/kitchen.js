let seenOrderIds = new Set();
let soundEnabled = false;
let audioContext;

async function loadOrders(){
  const res = await fetch("/api/orders");
  const orders = await res.json();
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
  [0, .18, .36].forEach((offset, index)=>{
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(index === 1 ? 880 : 660, now + offset);
    gain.gain.setValueAtTime(.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(.28, now + offset + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, now + offset + .12);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + .14);
  });
}

function renderOrders(orders){
  const activeOrders = orders.filter(order=>order.status !== "Ready for Payment and Pickup");
  const doneOrders = orders.filter(order=>order.status === "Ready for Payment and Pickup").slice(0, 6);

  ordersContainer.innerHTML = `
    <section>
      <h4>Preparing <span>${activeOrders.length}</span></h4>
      <div class="orders-list">${activeOrders.map(orderCard).join("") || emptyState("No active orders")}</div>
    </section>

    <section>
      <h4>Done <span>${doneOrders.length}</span></h4>
      <div class="orders-list done-list">${doneOrders.map(orderCard).join("") || emptyState("No completed orders")}</div>
    </section>
  `;
}

function orderCard(order){
  const created = new Date(order.createdAt).toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
  const displayNumber = String(order.orderNumber || order.id.slice(-3)).padStart(3, "0");
  const items = order.items.map(item=>`
    <div class="kitchen-item">
      <strong>${item.qty}x</strong>
      <span>${item.name}</span>
      <span>P${item.price}</span>
      <strong>P${item.subtotal}</strong>
    </div>
  `).join("");
  const messageButton = canOpenWhatsApp(order)
    ? `
      <button class="kitchen-action-btn" onclick="openWhatsAppCustomer('${order.id}')">WhatsApp</button>
      <button class="kitchen-action-btn" onclick="openViberCustomer('${order.id}')">Viber</button>
    `
    : `<button class="kitchen-action-btn" onclick="messageCustomer('${order.id}')">No Valid Number</button>`;
  const doneButton = order.status === "Ready for Payment and Pickup"
    ? `<div class="order-status">Ready for payment and pickup</div>`
    : `
      <div class="kitchen-actions">
        <button class="kitchen-action-btn ${order.status === "Preparing Order" ? "active" : ""}" onclick="markPreparing('${order.id}')">Preparing Order</button>
        <button class="kitchen-action-btn" onclick="markDone('${order.id}')">Mark Done</button>
        ${messageButton}
      </div>
    `;

  const statusText = order.status === "Ready for Payment and Pickup"
    ? "Ready for payment and pickup"
    : order.status;

  return `
    <article class="order-card">
      <div class="order-head">
        <div>
          <strong>${order.customerName}</strong>
          <span>Pickup ${order.pickupTime}</span>
          <span>${order.customerContact || order.customerMessenger || order.customerPhone || "No contact"}</span>
        </div>
        <div class="order-id">#${displayNumber}</div>
      </div>
      <div class="order-meta">Sent ${created}</div>
      <div class="order-status-line">${statusText}</div>
      <div class="kitchen-items">${items}</div>
      <div class="kitchen-total">Total P${order.total}</div>
      ${doneButton}
    </article>
  `;
}

function emptyState(message){
  return `<div class="empty-state">${message}</div>`;
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

async function openWhatsAppCustomer(id){
  const res = await fetch(`/api/orders/${id}`);
  const data = await res.json();

  if(!data.ok){
    return;
  }

  const order = data.order;
  const number = normalizeWhatsAppNumber(order.customerContact || "");

  if(!number){
    await messageCustomer(id);
    return;
  }

  const messageTextValue = customerMessage(order);
  await copyText(messageTextValue);
  await finishOrder(id);
  const message = encodeURIComponent(messageTextValue);
  window.location.href = `https://api.whatsapp.com/send?phone=${number}&text=${message}`;
}

async function openViberCustomer(id){
  const res = await fetch(`/api/orders/${id}`);
  const data = await res.json();

  if(!data.ok){
    return;
  }

  const order = data.order;
  const number = normalizeWhatsAppNumber(order.customerContact || "");

  if(!number){
    await messageCustomer(id);
    return;
  }

  await copyText(customerMessage(order));
  await finishOrder(id);
  window.location.href = `viber://chat?number=%2B${number}`;
}

async function finishOrder(id){
  await fetch(`/api/orders/${id}/done`, { method:"POST" });
}

function customerMessage(order){
  const orderNumber = String(order.orderNumber || 0).padStart(3, "0");
  return `Your order #${orderNumber} is ready for pickup and payment.`;
}

function canOpenWhatsApp(order){
  return Boolean(normalizeWhatsAppNumber(order.customerContact || ""));
}

function normalizeWhatsAppNumber(value){
  const cleaned = String(value || "").replace(/\D/g, "");

  if(cleaned.startsWith("09") && cleaned.length === 11){
    return `63${cleaned.slice(1)}`;
  }

  if(cleaned.startsWith("9") && cleaned.length === 10){
    return `63${cleaned}`;
  }

  if(cleaned.startsWith("63") && cleaned.length >= 12){
    return cleaned;
  }

  return "";
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
