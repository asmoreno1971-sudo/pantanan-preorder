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
const maxOrdersPerSlot = 5;
let activeOrderId = localStorage.getItem("activeOrderId") || "";
let lastNotifiedStatus = localStorage.getItem("lastNotifiedStatus") || "";
let activeOrderVisible = Boolean(activeOrderId);
let orderSubmitted = false;
let currentTotal = 0;
let storageWriteReady = true;
let storageWarning = "";
const requiredMenuVersion = "20260518-admin-canonical-menu";

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

  if("caches" in window){
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>/menu|preorder|pantanan|pos|roadworthy/i.test(key)).map(key=>caches.delete(key))))
      .catch(()=>{});
  }

  if("serviceWorker" in navigator){
    navigator.serviceWorker.getRegistrations()
      .then(registrations=>Promise.all(registrations.map(registration=>registration.unregister())))
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
    const res = await fetch(`/api/menu?view=${menuView}&fresh=${Date.now()}`, {
      cache:"no-store",
      headers:{
        "Cache-Control":"no-cache"
      }
    });
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

    if(menuSignature(orderableMenu) !== menuSignature(menu)){
      menu = orderableMenu;
      renderMenu();
    }
  }catch{
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
  const valid = needsCustomerFields
    ? nameVal && (!contactInput || normalizeMobileNumber(contactVal)) && hasItem && hasDeliveryTime && cashValid
    : hasItem && cashValid;
  orderButton.disabled = orderSubmitted || !valid || !storageWriteReady;
  orderButton.innerText = storageWriteReady ? orderButtonReadyText : "Database Required";
  orderButton.style.background = valid && !orderSubmitted && storageWriteReady ? "#1f8f4d" : "#ccc";
}

async function loadStorageStatus(){
  try{
    const res = await fetch(`/api/storage-status?fresh=${Date.now()}`, { cache:"no-store" });
    const data = await res.json();
    storageWriteReady = !data.writeProtected;
    storageWarning = data.storageWarning || "";
  }catch{
    storageWriteReady = true;
    storageWarning = "";
  }

  validate();
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

  const nameVal = nameInput ? nameInput.value.trim() : "CASHIER";
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

  if(!storageWriteReady){
    alert(storageWarning || "Database is required before sending live orders.");
    validate();
    return;
  }

  requestNotificationPermission();
  orderSubmitted = true;
  orderButton.disabled = true;
  orderButton.innerText = "Processing...";

  let data;

  try{
    const res = await fetch("/api/orders", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        customerName:nameVal,
        customerContact:contactVal,
        pickupTime,
        items,
        source:isCashierPage ? "cashier" : "customer",
        cashReceived:cashInput ? Number(cashInput.value || 0) : undefined
      })
    });
    data = await res.json();
  }catch{
    orderSubmitted = false;
    orderButton.disabled = false;
    orderButton.innerText = orderButtonReadyText;
    alert("Unable to send order. Please check your internet connection and try again.");
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

  if(order.status === "Done"){
    dismissCustomerStatus();
    return;
  }

  const message = {
    "Order Sent":"Your order has been sent. Wait for confirmation.",
    "Preparing Order":"Your order is now being prepared.",
    "Ready for Payment and Pickup":"Your order is ready for payment and pickup."
  }[order.status] || order.status;

  const displayNumber = String(order.orderNumber || order.id.slice(-3)).padStart(3, "0");
  customerStatusTitle.innerText = `Order #${displayNumber}`;
  customerStatusText.innerText = message;
  customerStatus.classList.remove("status-sent", "status-preparing", "status-ready");
  customerStatus.classList.add(statusClass(order.status));
  customerStatus.classList.remove("hidden");

  if(order.status === "Preparing Order"){
    notifyCustomer(order, "Pantanan order update", "Your order is now being prepared.");
  }

  if(order.status === "Ready for Payment and Pickup"){
    notifyCustomer(order, "Pantanan order ready", "Your order is ready for payment and pickup.");
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
  closing.setHours(23, 0, 0, 0);
  const earliest = new Date(now.getTime() + 5 * 60 * 1000);
  if(earliest.getSeconds() || earliest.getMilliseconds()){
    earliest.setMinutes(earliest.getMinutes() + 1, 0, 0);
  }
  roundUpToMinuteInterval(earliest, 5);
  const minTime = earliest > opening ? earliest : opening;

  return {
    min:formatTimeValue(minTime),
    max:"23:00",
    earliest:formatTimeValue(earliest),
    closed:earliest > closing
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
  const key = `${order.id}:${order.status}`;

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

setInterval(updateNowTime, 1000);
setInterval(checkActiveOrder, 5000);
setInterval(refreshMenuIfIdle, 60000);
window.addEventListener("focus", refreshMenuIfIdle);
window.addEventListener("pageshow", refreshMenuIfIdle);
window.addEventListener("online", refreshMenuIfIdle);
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    refreshMenuIfIdle();
  }
});
updateNowTime();
generateTimes();
eraseLegacyMenuMemory();
loadSavedCustomer();
updatePaymentVisibility();
updateCashInputWidth();
loadMenu();
loadStorageStatus();
checkActiveOrder();
validate();
