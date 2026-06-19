let menu = [];
const quantities = {};
const categories = ["Sandwiches", "Drinks", "Dimsum", "Noodle", "Other"];
const nameInput = document.getElementById("name");
const contactInput = document.getElementById("contact");
const timeDropdown = document.getElementById("timeSelect");
const selectedTime = document.getElementById("time");
const summaryTimeText = document.getElementById("summaryTime");
const summaryTitleText = document.getElementById("summaryTitle");
const menuList = document.getElementById("menuContainer");
const orderButton = document.getElementById("orderBtn");
const kioskClosedMessage = document.getElementById("kioskClosedMessage");
const currentTimeText = document.getElementById("nowTime");
const summaryItems = document.getElementById("liveSummary");
const totalText = document.getElementById("liveTotal");
const cashInput = document.getElementById("cashInput");
const changeOutput = document.getElementById("changeOutput");
const cashPanel = document.querySelector(".cash-panel");
const orderButtonReadyText = orderButton ? orderButton.dataset.readyText || orderButton.innerText || "Send Order" : "Send Order";
const isCashierPage = window.location.pathname.replace(/\/$/, "") === "/cashier";
const modal = document.getElementById("successModal");
const successTitle = document.getElementById("successTitle");
const successText = document.getElementById("successText");
const customerStatus = document.getElementById("customerStatus");
const customerStatusTitle = document.getElementById("customerStatusTitle");
const customerStatusText = document.getElementById("customerStatusText");
const cashierOffline = window.CashierOffline || null;
const cashierOfflineStatus = document.getElementById("cashierOfflineStatus");
const cashierOfflineText = document.getElementById("cashierOfflineText");
const cashierSyncButton = document.getElementById("cashierSyncBtn");
const maxOrdersPerSlot = 5;
let activeOrderId = localStorage.getItem("activeOrderId") || "";
let lastNotifiedStatus = localStorage.getItem("lastNotifiedStatus") || "";
let activeOrderVisible = Boolean(activeOrderId);
let orderSubmitted = false;
let currentTotal = 0;
let storageWriteReady = true;
let storageWarning = "";
let statusCheckInFlight = false;
let cashierSyncInFlight = false;
let cashierOfflineReady = !isCashierPage;
let cashierSyncWarning = "";
let kioskStatus = {
  open:true,
  message:""
};
const requiredMenuVersion = "current-admin-canonical-menu";

function kioskBranchName(){
  const host = window.location.hostname.toLowerCase();
  return host.includes("pos-pantanan") || host.includes("foodkiosk2") ? "Pantanan" : "Roadworthy";
}

function applyKioskBrand(){
  const branch = kioskBranchName();
  document.querySelectorAll(".summary-brand").forEach(element=>{
    element.textContent = `Food Kiosk - ${branch}`;
  });

  if(document.title.includes("Roadworthy") || document.title.includes("Pantanan")){
    document.title = `${branch} Menu`;
  }
}

function eraseLegacyMenuMemory(){
  [
    "pantananCustomerMenuV1",
    "pantananCashierMenuV1",
    "menu",
    "menu.json",
    "products",
    "posRwMenu",
    "adminMenuDraft",
    "adminMenuLastGood",
    "adminMenuServerSavedAt"
  ].forEach(key=>localStorage.removeItem(key));

  if(!isCashierPage && "caches" in window){
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>!key.startsWith("roadworthy-cashier-shell-") && /menu|preorder|pantanan|pos|roadworthy/i.test(key)).map(key=>caches.delete(key))))
      .catch(()=>{});
  }

  if(!isCashierPage && "serviceWorker" in navigator){
    navigator.serviceWorker.getRegistrations()
      .then(registrations=>Promise.all(registrations
        .filter(registration=>!String((registration.active && registration.active.scriptURL) || "").includes("/cashier-sw.js"))
        .map(registration=>registration.unregister())))
      .catch(()=>{});
  }
}

function loadSavedCustomer(){
  localStorage.removeItem("customerNickname");
  localStorage.removeItem("customerContact");
  if(nameInput) nameInput.value = "";
  if(contactInput) contactInput.value = "";
}

function saveCustomer(){
  localStorage.removeItem("customerNickname");
  localStorage.removeItem("customerContact");
}

async function loadMenu(){
  try{
    const menuView = isCashierPage ? "cashier" : "customer";
    const res = await fetch(`/api/menu?view=${menuView}`, { cache:"no-store" });
    const menuSource = res.headers.get("X-Menu-Source");
    const menuVersion = res.headers.get("X-Menu-Version");

    if(menuSource !== "admin-persistent-menu" || menuVersion !== requiredMenuVersion){
      throw new Error("Wrong menu source or version");
    }

    const freshMenu = await res.json();

    if(!Array.isArray(freshMenu)){
      return;
    }

    const orderableMenu = freshMenu.filter(item=>item.available !== false);

    if(isCashierPage && cashierOffline){
      cashierOffline.saveMenu(orderableMenu).catch(()=>{});
    }

    if(menuSignature(orderableMenu) !== menuSignature(menu)){
      menu = orderableMenu;
      renderMenu();
    }
  }catch{
    if(isCashierPage && cashierOffline){
      const savedMenu = await cashierOffline.loadMenu().catch(()=>[]);
      if(savedMenu.length){
        menu = savedMenu.filter(item=>item.available !== false);
        renderMenu();
        updateCashierOfflineUi();
        return;
      }
    }
    if(!menu.length){
      menuList.innerHTML = `<div class="category-empty">Menu is loading. Please refresh.</div>`;
    }
  }
}

function menuSignature(items){
  return (Array.isArray(items) ? items : [])
    .map(item=>`${item.id}|${item.name}|${item.price}|${item.category}|${item.available !== false}|${item.image}|${item.imageFingerprint || ""}`)
    .join("\n");
}

function hasSelectedItems(){
  return Object.values(quantities).some(qty=>qty > 0);
}

function refreshMenuIfIdle(){
  if(!orderSubmitted && !hasSelectedItems()){
    loadMenu();
  }
}

function updateNowTime(){
  if(!currentTimeText){
    return;
  }

  const now = new Date();
  const date = now.toLocaleDateString();
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2,"0");
  const ap = h >= 12 ? "PM" : "AM";
  const dh = h % 12 || 12;
  currentTimeText.innerText = `${date} ${dh}:${m} ${ap}`;
}

function generateTimes(){
  if(!timeDropdown || !selectedTime || !summaryTimeText){
    return;
  }

  const limits = deliveryTimeLimits();
  timeDropdown.innerHTML = "";
  timeDropdown.disabled = limits.closed;
  if(!limits.closed){
    const options = deliveryTimeOptions(limits);
    for(const value of options){
      const option = document.createElement("option");
      option.value = value;
      option.textContent = formatDeliveryTime(value);
      timeDropdown.appendChild(option);
    }
    timeDropdown.disabled = options.length === 0;
  }else{
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Closed for today";
    timeDropdown.appendChild(option);
  }
  timeDropdown.value = timeDropdown.disabled ? "" : timeDropdown.options[0].value;
  selectedTime.value = formatDeliveryTime(timeDropdown.value);
  summaryTimeText.innerHTML = selectedTime.value ? `<strong>${selectedTime.value}</strong>` : "--";
  const timePickerWrap = timeDropdown.closest(".time-picker-wrap");
  if(timePickerWrap){
    timePickerWrap.classList.toggle("has-time", Boolean(timeDropdown.value));
  }
  updateKioskClosedMessage();
}

if(timeDropdown){
  const timePickerWrap = timeDropdown.closest(".time-picker-wrap");
  const syncDeliveryTime = function(){
    selectedTime.value = formatDeliveryTime(this.value);
    summaryTimeText.innerHTML = selectedTime.value ? `<strong>${selectedTime.value}</strong>` : "--";
    if(timePickerWrap){
      timePickerWrap.classList.toggle("has-time", Boolean(this.value));
    }
    validate();
  };
  timeDropdown.addEventListener("change", syncDeliveryTime);
  if(timePickerWrap){
    timePickerWrap.addEventListener("click", function(event){
      if(event.target !== timeDropdown && !timeDropdown.disabled){
        timeDropdown.focus();
      }
    });
  }
}

if(nameInput){
  nameInput.addEventListener("input", function(){
    validate();
    saveCustomer();
  });
}

if(contactInput){
  contactInput.addEventListener("input", function(){
    validate();
    saveCustomer();
  });
}

if(cashInput){
  cashInput.addEventListener("focus", showCashPresets);
  cashInput.addEventListener("click", showCashPresets);
  cashInput.addEventListener("input", function(){
    updateCashInputWidth();
    updateChange();
    validate();
  });
}

if(cashPanel){
  cashPanel.addEventListener("mouseenter", showCashPresets);
  cashPanel.addEventListener("mouseleave", hideCashPresets);
  cashPanel.addEventListener("focusin", showCashPresets);
  document.addEventListener("pointerdown", function(event){
    if(!cashPanel.contains(event.target)){
      hideCashPresets();
    }
  });
}

document.addEventListener("keydown", function(e){
  if(e.key !== "Enter"){
    return;
  }

  const focusOrder = [
    nameInput,
    contactInput,
    timeDropdown,
    ...document.querySelectorAll(".img-wrap, .qty-btn"),
    orderButton
  ].filter(Boolean);
  const currentIndex = focusOrder.indexOf(document.activeElement);

  if(currentIndex === -1 || currentIndex === focusOrder.length - 1){
    return;
  }

  e.preventDefault();
  focusOrder[currentIndex + 1].focus();
});

function renderMenu(){
  menuList.innerHTML = "";

  categories.forEach(category=>{
    const items = menu
      .filter(item=>normalizeCategory(item.category) === category)
      .sort((a, b)=>String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity:"base" }));

    const section = document.createElement("div");
    section.className = "category-section";
    section.innerHTML = `
      <h4 class="category-title ${categoryTitleClass(category)}">${category}</h4>
      <div class="category-items"></div>
    `;
    menuList.appendChild(section);
    const categoryItems = section.querySelector(".category-items");

    if(!items.length){
      categoryItems.innerHTML = `<div class="category-empty">No products yet</div>`;
      return;
    }

    items.forEach(item=>{
      if(quantities[item.id] === undefined){
        quantities[item.id] = 0;
      }

      const row = document.createElement("div");
      row.className = `menu-row ${quantities[item.id] > 0 ? "" : "is-empty"}`;
      const image = item.image || "";
      const productMedia = image
        ? `<img class="product-img" src="${image}" alt="${item.name}" loading="lazy" decoding="async" onerror="this.style.display='none';this.parentElement.classList.add('no-product-image')">`
        : `<div class="product-img product-img-empty" aria-hidden="true"></div>`;
      row.innerHTML = `
        <div class="product-name-bar">${item.name}</div>
        <div class="img-wrap" role="button" tabindex="0" aria-label="Add one ${item.name}" onclick="changeQty('${item.id}',1)" onkeydown="addFromImage(event,'${item.id}')">
          ${productMedia}
          <div class="overlay-price">P${item.price}</div>
        </div>

        <div class="order-line">
          <button class="qty-btn qty-minus" aria-label="Remove one ${item.name}" title="Remove one" onclick="changeQty('${item.id}',-1)">−</button>
          <div id="q-${item.id}" class="qty">${quantities[item.id]}</div>
        </div>
      `;

      categoryItems.appendChild(row);
    });
  });
}

function categoryTitleClass(category){
  const normalized = normalizeCategory(category).toLowerCase();
  return `category-title-${normalized}`;
}

function normalizeCategory(category){
  const normalized = category === "Sandwhich" || category === "Sandwich" ? "Sandwiches" : category;
  if(normalized === "Cookies"){
    return "Other";
  }

  return categories.includes(normalized) ? normalized : "Drinks";
}

function addFromImage(e,id){
  if(e.key !== "Enter" && e.key !== " "){
    return;
  }

  e.preventDefault();
  changeQty(id, 1);
}

function changeQty(id, delta){
  quantities[id] += delta;

  if(quantities[id] < 0){
    quantities[id] = 0;
  }

  document.getElementById(`q-${id}`).innerText = quantities[id];
  const row = document.getElementById(`q-${id}`).closest(".menu-row");

  if(row){
    row.classList.toggle("is-empty", quantities[id] === 0);
  }

  updateTotal();
  validate();
}

function updateTotal(){
  let total = 0;

  menu.forEach(item=>{
    const sub = quantities[item.id] * item.price;
    total += sub;
  });

  currentTotal = total;
  syncCashToTotal();
  updateSummary(total);
  updatePaymentVisibility();
  updateChange();
}

function updateSummary(total){
  let html = "";

  menu.forEach(item=>{
    if(quantities[item.id] > 0){
      const qty = quantities[item.id];
      const sub = qty * item.price;
      html += `
        <div class="sum-row">
          <div>${item.name}</div>
          <div class="sum-qty">${qty}</div>
          <div class="sum-price">P${sub}</div>
        </div>
      `;
    }
  });

  summaryItems.innerHTML = html || "No items yet";
  totalText.innerText = total;
}

function validate(){
  const nameVal = nameInput ? nameInput.value.trim() : "";

  if(nameInput){
    nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, " ").slice(0, 30);
  }

  summaryTitleText.innerHTML = "Order Summary";

  const hasItem = Object.values(quantities).some(qty=>qty > 0);
  const contactVal = contactInput ? contactInput.value.trim() : "";
  const hasDeliveryTime = !timeDropdown || Boolean(timeDropdown.value);
  const needsCustomerFields = Boolean(nameInput || contactInput || timeDropdown);
  const cashValid = !cashInput || Number(cashInput.value || 0) >= currentTotal;
  const kioskOpen = isCashierPage || kioskStatus.open !== false;
  const valid = needsCustomerFields
    ? (!nameInput || nameVal) && (!contactInput || normalizeMobileNumber(contactVal)) && hasItem && hasDeliveryTime && cashValid && kioskOpen
    : hasItem && cashValid && kioskOpen;
  const canStoreOrder = storageWriteReady || (isCashierPage && cashierOfflineReady);
  orderButton.disabled = orderSubmitted || !valid || !canStoreOrder;
  orderButton.innerText = kioskOpen ? (canStoreOrder ? orderButtonReadyText : "Database Required") : "Closed Today";
  orderButton.style.background = valid && !orderSubmitted && canStoreOrder ? "#1f8f4d" : "#ccc";
  updateKioskClosedMessage();
}

async function loadStorageStatus(){
  if(statusCheckInFlight){
    return;
  }

  statusCheckInFlight = true;
  try{
    const res = await fetch("/api/storage-status", { cache:"no-store" });
    const data = await res.json();
    storageWriteReady = !data.orderWriteProtected;
    storageWarning = data.storageWarning || "";
  }catch{
    storageWriteReady = true;
    storageWarning = "";
  }finally{
    statusCheckInFlight = false;
  }

  validate();
}

async function loadKioskStatus(){
  if(isCashierPage){
    kioskStatus = { open:true, message:"" };
    return;
  }

  try{
    const res = await fetch(`/api/kiosk-status?fresh=${Date.now()}`, { cache:"no-store" });
    const data = await res.json();

    if(!res.ok || !data.ok || !data.status){
      throw new Error("Kiosk status unavailable");
    }

    kioskStatus = data.status;
  }catch{
    kioskStatus = { open:true, message:"" };
  }

  generateTimes();
  validate();
}

function updateKioskClosedMessage(){
  if(!kioskClosedMessage){
    return;
  }

  const closed = kioskStatus.open === false;
  kioskClosedMessage.innerText = closed ? kioskStatus.message || "The kiosk is closed today." : "";
  kioskClosedMessage.classList.toggle("hidden", !closed);
}

function updateChange(){
  if(!changeOutput){
    return;
  }

  const cash = Number(cashInput ? cashInput.value || 0 : 0);
  const change = Math.max(0, cash - currentTotal);
  changeOutput.value = String(change);
  updateCashInputWidth();
}

function updatePaymentVisibility(){
  if(!cashPanel){
    return;
  }

  cashPanel.classList.toggle("hidden", currentTotal <= 0);
}

function updateCashInputWidth(){
  if(!cashInput){
    return;
  }

  const digits = String(cashInput.value || "0").length;
  cashInput.style.width = `${Math.max(1, digits)}ch`;
  cashInput.style.flexBasis = `${Math.max(1, digits)}ch`;
}

function setCashAmount(amount){
  if(!cashInput){
    return;
  }

  cashInput.value = amount;
  updateCashInputWidth();
  updateChange();
  validate();
  hideCashPresets();
}

function syncCashToTotal(){
  if(!cashInput){
    return;
  }

  cashInput.value = currentTotal > 0 ? String(currentTotal) : "";
  updateCashInputWidth();
}

function showCashPresets(){
  if(cashPanel && currentTotal > 0){
    cashPanel.classList.add("cash-presets-open");
  }
}

function hideCashPresets(){
  if(cashPanel){
    cashPanel.classList.remove("cash-presets-open");
  }
}

async function openSummary(){
  if(orderSubmitted){
    return;
  }

  if(!isCashierPage && kioskStatus.open === false){
    alert(kioskStatus.message || "The kiosk is closed today.");
    validate();
    return;
  }

  const nameVal = nameInput ? nameInput.value.trim() : (isCashierPage ? "CASHIER" : "");
  const contactVal = contactInput ? contactInput.value.trim() : "";
  const pickupTime = selectedTime && timeDropdown ? selectedTime.value || formatDeliveryTime(timeDropdown.value) : "Cashier";
  const items = menu
    .filter(item=>quantities[item.id] > 0)
    .map(item=>({
      id:item.id,
      name:item.name,
      product:item.name,
      price:item.price,
      qty:quantities[item.id]
    }));

  if(nameInput && !nameVal){
    alert("Please enter the customer name.");
    nameInput.focus();
    return;
  }

  if(contactInput && !contactVal){
    alert("Please enter your mobile number.");
    contactInput.focus();
    return;
  }

  if(contactInput && !normalizeMobileNumber(contactVal)){
    alert("Please enter a valid Philippine mobile number.");
    contactInput.focus();
    return;
  }

  if(!items.length){
    alert("Please tap a product photo to add an item.");
    return;
  }

  if(!storageWriteReady && !isCashierPage){
    alert(storageWarning || "Database is required before sending live orders.");
    validate();
    return;
  }

  requestNotificationPermission();
  orderSubmitted = true;
  orderButton.disabled = true;
  orderButton.innerText = "Processing...";

  let data;

  const payload = {
    customerName:nameVal,
    customerContact:contactVal,
    pickupTime,
    items,
    source:isCashierPage ? "cashier" : "customer",
    cashReceived:cashInput ? Number(cashInput.value || 0) : undefined
  };

  try{
    data = isCashierPage
      ? await submitCashierOrder(payload)
      : await postOrder(payload);
  }catch{
    orderSubmitted = false;
    orderButton.disabled = false;
    orderButton.innerText = orderButtonReadyText;
    alert(isCashierPage ? "Sale could not be saved on this device. Please retry." : "Unable to send order. Please check your internet connection and try again.");
    validate();
    return;
  }

  if(!data.ok){
    orderSubmitted = false;
    orderButton.disabled = false;
    orderButton.innerText = orderButtonReadyText;
    alert(data.message || "Unable to send order");
    await generateTimes();
    validate();
    return;
  }

  saveCustomer();
  if(isCashierPage && data.queued){
    updateCashierOfflineUi();
  }
  if(!isCashierPage){
    activeOrderId = data.order.id;
    localStorage.setItem("activeOrderId", activeOrderId);
    activeOrderVisible = true;
    lastNotifiedStatus = "";
    localStorage.removeItem("lastNotifiedStatus");
    showCustomerStatus(data.order);
  }
  resetOrderForm();

  orderSubmitted = false;
  orderButton.disabled = false;
  orderButton.innerText = orderButtonReadyText;
  validate();
}

async function postOrder(payload){
  const res = await fetch("/api/orders", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify(payload)
  });
  const data = await res.json();

  if(!res.ok && !data.ok){
    const error = new Error(data.message || "Unable to send order");
    error.responseData = data;
    error.permanent = res.status >= 400 && res.status < 500;
    throw error;
  }

  return data;
}

async function submitCashierOrder(payload){
  if(!cashierOffline){
    return postOrder(payload);
  }

  const sale = {
    ...payload,
    clientTransactionId:cashierOffline.transactionId(),
    offlineQueuedAt:new Date().toISOString()
  };

  if(navigator.onLine && storageWriteReady){
    try{
      return await postOrder(sale);
    }catch(error){
      if(error.permanent){
        throw error;
      }
    }
  }

  await cashierOffline.queueSale(sale);
  return { ok:true, queued:true };
}

async function updateCashierOfflineUi(message){
  if(!isCashierPage || !cashierOffline || !cashierOfflineStatus || !cashierOfflineText){
    return;
  }

  const pending = await cashierOffline.countPending().catch(()=>0);
  const offline = !navigator.onLine;
  cashierOfflineStatus.classList.toggle("pending", pending > 0 && !offline);
  cashierOfflineStatus.classList.toggle("offline", offline);
  cashierOfflineText.innerText = message || cashierSyncWarning || (pending
    ? `${pending} sale${pending === 1 ? "" : "s"} saved on this phone, waiting to sync.`
    : offline
      ? "Offline. New sales will be saved on this phone."
      : "Online. Cashier sales are synced.");
  if(cashierSyncButton){
    cashierSyncButton.disabled = cashierSyncInFlight || pending === 0 || offline;
  }
}

async function syncPendingCashierSales(){
  if(!isCashierPage || !cashierOffline || cashierSyncInFlight || !navigator.onLine){
    updateCashierOfflineUi();
    return;
  }

  cashierSyncInFlight = true;
  cashierSyncWarning = "";
  updateCashierOfflineUi("Syncing saved cashier sales...");
  try{
    const pending = await cashierOffline.pendingSales();
    for(const sale of pending){
      try{
        const data = await postOrder(sale);
        if(data.ok){
          await cashierOffline.removeSale(sale.clientTransactionId);
        }
      }catch(error){
        if(error.permanent){
          cashierSyncWarning = "A saved sale needs attention. It remains safely stored on this phone.";
        }
        break;
      }
    }
  }finally{
    cashierSyncInFlight = false;
    updateCashierOfflineUi();
  }
}

async function initializeCashierOffline(){
  if(!isCashierPage || !cashierOffline){
    return;
  }

  try{
    await cashierOffline.registerServiceWorker();
    await cashierOffline.countPending();
    cashierOfflineReady = true;
  }catch{
    cashierOfflineReady = false;
  }

  updateCashierOfflineUi();
  validate();
  syncPendingCashierSales();
}

function normalizeMobileNumber(value){
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

function resetOrderForm(){
  if(nameInput) nameInput.value = "";
  if(contactInput) contactInput.value = "";
  if(timeDropdown) timeDropdown.value = "";
  if(selectedTime) selectedTime.value = "";
  if(summaryTimeText) summaryTimeText.innerText = "--";
  if(cashInput) cashInput.value = "";

  Object.keys(quantities).forEach(id=>{
    quantities[id] = 0;
    const quantityText = document.getElementById(`q-${id}`);

    if(quantityText){
      quantityText.innerText = "0";
      const row = quantityText.closest(".menu-row");

      if(row){
        row.classList.add("is-empty");
      }
    }
  });

  updateTotal();
  summaryTitleText.innerHTML = "Order Summary";
  generateTimes();
}

function closeSuccessModal(){
  if(modal){
    modal.classList.remove("show");
  }
}

function dismissCustomerStatus(){
  activeOrderId = "";
  localStorage.removeItem("activeOrderId");
  localStorage.removeItem("lastNotifiedStatus");
  lastNotifiedStatus = "";
  activeOrderVisible = false;
  if(!customerStatus){
    return;
  }

  customerStatus.classList.add("hidden");
}

function showCustomerStatus(order){
  if(!activeOrderVisible || !customerStatus || !customerStatusTitle || !customerStatusText){
    return;
  }

  const customerFacingStatus = order.customerStatus || order.status;

  if(customerFacingStatus === "Done"){
    dismissCustomerStatus();
    return;
  }

  const message = {
    "Order Sent":"Your order has been sent. Wait for confirmation.",
    "Preparing Order":"Your order has been received and is being prepared.",
    "Ready for Payment and Pickup":"Your order is ready for payment/pickup."
  }[customerFacingStatus] || customerFacingStatus;

  const displayNumber = String(order.orderNumber || order.id.slice(-3)).padStart(3, "0");
  customerStatusTitle.innerText = `Order #${displayNumber}`;
  customerStatusText.innerText = message;
  customerStatus.classList.remove("status-sent", "status-preparing", "status-ready");
  customerStatus.classList.add(statusClass(customerFacingStatus));
  customerStatus.classList.remove("hidden");

  if(customerFacingStatus === "Preparing Order"){
    notifyCustomer(order, "Pantanan order update", "Your order has been received and is being prepared.");
  }

  if(customerFacingStatus === "Ready for Payment and Pickup"){
    notifyCustomer(order, "Pantanan order ready", "Your order is ready for payment/pickup.");
  }
}

function requestNotificationPermission(){
  if(!("Notification" in window) || Notification.permission !== "default"){
    return;
  }

  Notification.requestPermission().catch(()=>{});
}

async function loadSlotCounts(){
  try{
    const res = await fetch("/api/orders");
    const orders = await res.json();
    const today = localOrderDate();

    return orders.reduce((counts, order)=>{
      if(order.orderDate === today && order.pickupTime){
        counts[order.pickupTime] = (counts[order.pickupTime] || 0) + 1;
      }

      return counts;
    }, {});
  }catch{
    return {};
  }
}

function nextQuarterHour(date){
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const nextMinutes = Math.ceil(minutes / 15) * 15;
  rounded.setMinutes(nextMinutes, 0, 0);
  return rounded;
}

function deliveryTimeLimits(){
  const now = new Date();
  const opening = new Date();
  opening.setHours(8, 0, 0, 0);
  const closing = new Date();
  closing.setHours(16, 0, 0, 0);
  const earliest = new Date(now.getTime() + 5 * 60 * 1000);
  if(earliest.getSeconds() || earliest.getMilliseconds()){
    earliest.setMinutes(earliest.getMinutes() + 1, 0, 0);
  }
  roundUpToMinuteInterval(earliest, 5);
  const minTime = earliest > opening ? earliest : opening;
  const closedBySettings = !isCashierPage && kioskStatus.open === false;

  return {
    min:formatTimeValue(minTime),
    max:"16:00",
    earliest:formatTimeValue(earliest),
    closed:closedBySettings || earliest > closing
  };
}

function deliveryTimeOptions(limits){
  const options = [];
  const cursor = timeValueToDate(limits.earliest);
  const closing = timeValueToDate(limits.max);

  while(cursor <= closing){
    options.push(formatTimeValue(cursor));
    cursor.setMinutes(cursor.getMinutes() + 5, 0, 0);
  }

  return options;
}

function timeValueToDate(value){
  const [hourText, minuteText] = String(value || "00:00").split(":");
  const date = new Date();
  date.setHours(Number(hourText) || 0, Number(minuteText) || 0, 0, 0);
  return date;
}

function roundUpToMinuteInterval(date, interval){
  const minutes = date.getMinutes();
  const remainder = minutes % interval;

  if(remainder){
    date.setMinutes(minutes + (interval - remainder), 0, 0);
  }
}

function formatTimeValue(date){
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDeliveryTime(value){
  if(!value){
    return "";
  }

  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = String(minuteText || "00").padStart(2, "0");

  if(Number.isNaN(hour)){
    return "";
  }

  const ap = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${ap}`;
}

function localOrderDate(){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function statusClass(status){
  if(status === "Ready for Payment and Pickup"){
    return "status-ready";
  }

  if(status === "Preparing Order"){
    return "status-preparing";
  }

  return "status-sent";
}

function notifyCustomer(order,title,message){
  const key = `${order.id}:${order.customerStatus || order.status}`;

  if(lastNotifiedStatus === key){
    return;
  }

  lastNotifiedStatus = key;
  localStorage.setItem("lastNotifiedStatus", key);

  if("vibrate" in navigator){
    navigator.vibrate([180, 80, 180]);
  }

  if("Notification" in window && Notification.permission === "granted"){
    new Notification(title, {
      body:message,
      tag:`pantanan-${order.id}`
    });
  }
}

async function checkActiveOrder(){
  if(!activeOrderId){
    return;
  }

  let res;

  try{
    res = await fetch(`/api/orders/${activeOrderId}`);
  }catch{
    return;
  }

  if(!res.ok){
    return;
  }

  const data = await res.json();

  if(data.ok){
    showCustomerStatus(data.order);
  }
}

async function activateCustomerOfflineShell(){
  if(!("serviceWorker" in navigator)){
    return;
  }

  const appShellPaths = [
    "/", "/customer", "/admin", "/cashier", "/kitchen", "/sales", "/transaction", "/transactions", "/expenses", "/qr",
    "/login", "/teacher-login", "/student-dashboard", "/students", "/personnel", "/personnel-profile",
    "/guidance", "/guidance-report", "/teacher-accounts", "/teacher-profile", "/mineralex", "/mineralex/"
  ];
  const urls = new Set([window.location.href]);
  appShellPaths.forEach(path=>urls.add(new URL(path, window.location.origin).href));
  document.querySelectorAll("link[href], script[src], img[src]").forEach(element=>{
    const value = element.href || element.src;
    if(value){
      urls.add(value);
    }
  });

  const registration = await navigator.serviceWorker.register("/learner-sw.js?v=current", { scope:"/" });
  await registration.update().catch(()=>{});
  const readyRegistration = await navigator.serviceWorker.ready;
  const worker = readyRegistration.active || readyRegistration.waiting || readyRegistration.installing;
  worker?.postMessage({ type:"CACHE_SHELL_URLS", urls:[...urls] });
}

setInterval(updateNowTime, 60000);
setInterval(loadStorageStatus, 60000);
setInterval(loadKioskStatus, 60000);
setInterval(checkActiveOrder, 7000);
setInterval(refreshMenuIfIdle, 60000);
setInterval(syncPendingCashierSales, 60000);
window.addEventListener("focus", ()=>{
  refreshMenuIfIdle();
  loadStorageStatus();
  loadKioskStatus();
});
window.addEventListener("pageshow", ()=>{
  refreshMenuIfIdle();
  loadStorageStatus();
  loadKioskStatus();
});
window.addEventListener("online", ()=>{
  refreshMenuIfIdle();
  loadKioskStatus();
  syncPendingCashierSales();
  updateCashierOfflineUi();
});
window.addEventListener("offline", ()=>updateCashierOfflineUi());
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    refreshMenuIfIdle();
    loadStorageStatus();
    loadKioskStatus();
  }
});
updateNowTime();
generateTimes();
applyKioskBrand();
eraseLegacyMenuMemory();
initializeCashierOffline();
loadSavedCustomer();
updatePaymentVisibility();
updateCashInputWidth();
loadMenu();
setTimeout(loadStorageStatus, 1200);
loadKioskStatus();
checkActiveOrder();
activateCustomerOfflineShell().catch(()=>{});
validate();
