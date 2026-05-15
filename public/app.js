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
const exactCashButton = document.getElementById("exactCashBtn");
const cashPanel = document.querySelector(".cash-panel");
const modal = document.getElementById("successModal");
const successTitle = document.getElementById("successTitle");
const successText = document.getElementById("successText");
const customerStatus = document.getElementById("customerStatus");
const customerStatusTitle = document.getElementById("customerStatusTitle");
const customerStatusText = document.getElementById("customerStatusText");
const maxOrdersPerSlot = 5;
let activeOrderId = localStorage.getItem("activeOrderId") || "";
let lastNotifiedStatus = localStorage.getItem("lastNotifiedStatus") || "";
let activeOrderVisible = false;
let orderSubmitted = false;
let currentTotal = 0;

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
  const res = await fetch(`/api/menu-lite?fresh=${Date.now()}`, { cache:"no-store" });
  menu = await res.json();
  renderMenu();
}

function updateNowTime(){
  const now = new Date();
  const date = now.toLocaleDateString();
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2,"0");
  const ap = h >= 12 ? "PM" : "AM";
  const dh = h % 12 || 12;
  currentTimeText.innerText = `${date} ${dh}:${m} ${ap}`;
}

async function generateTimes(){
  if(!timeDropdown || !selectedTime || !summaryTimeText){
    return;
  }

  let hasAvailableSlot = false;
  timeDropdown.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- Select Time --";
  timeDropdown.appendChild(placeholder);
  selectedTime.value = "";
  summaryTimeText.innerHTML = "--";
  const slotCounts = await loadSlotCounts();
  const now = new Date();
  const earliest = nextQuarterHour(new Date(now.getTime() + 15 * 60 * 1000));
  const start = new Date();
  start.setHours(8, 0, 0, 0);
  const end = new Date(start);
  end.setHours(21, 0, 0, 0);

  for(let slot = new Date(start); slot <= end; slot.setMinutes(slot.getMinutes() + 15)){
    const slotTime = new Date(slot);

    if(slotTime < earliest){
      continue;
    }

    const h = slotTime.getHours();
    const ap = h >= 12 ? "PM" : "AM";
    const dh = h % 12 || 12;
    const dm = slotTime.getMinutes().toString().padStart(2,"0");
    const t = `${dh}:${dm} ${ap}`;

    if((slotCounts[t] || 0) >= maxOrdersPerSlot){
      continue;
    }

    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    timeDropdown.appendChild(opt);
    hasAvailableSlot = true;
  }

  if(!hasAvailableSlot){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No more slots today";
    opt.disabled = true;
    timeDropdown.appendChild(opt);
  }
}

if(timeDropdown){
  timeDropdown.onchange = function(){
    selectedTime.value = this.value;
    summaryTimeText.innerHTML = this.value ? `<strong>${this.value}</strong>` : "--";
    validate();
  };
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
      const fallback = productImage(item);
      const image = item.image || fallback;
      row.innerHTML = `
        <div class="img-wrap" role="button" tabindex="0" aria-label="Add one ${item.name}" onclick="changeQty('${item.id}',1)" onkeydown="addFromImage(event,'${item.id}')">
          <img class="product-img" src="${image}" alt="${item.name}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${fallback}'">
          <div class="overlay-name">${item.name}</div>
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

function productImage(item){
  const category = normalizeCategory(item.category);
  const palettes = {
    Sandwiches:["#efc486", "#8a5530", "#fff2c7", "#72a35b"],
    Drinks:["#dcae73", "#5b3322", "#fff2dd", "#b78052"],
    Dimsum:["#f2c98f", "#8d5c2f", "#fff3d8", "#c6783d"],
    Noodle:["#f0d17d", "#73502a", "#fff0b8", "#b56b38"],
    Others:["#c8d6c3", "#4d6048", "#f2ead8", "#829b7a"]
  };
  const [bg, dark, light, accent] = palettes[category] || palettes.Others;
  const art = category === "Sandwiches"
    ? `<path d="M34 88 L110 24 L186 88 Z" fill="${light}"/>
       <path d="M48 86 L110 39 L172 86 Z" fill="${accent}"/>
       <path d="M58 88 L110 51 L162 88 Z" fill="${dark}" opacity=".8"/>
       <rect x="46" y="86" width="128" height="20" rx="8" fill="${light}"/>
       <circle cx="68" cy="36" r="12" fill="#fff7dc" opacity=".8"/>`
      : category === "Dimsum"
        ? `<ellipse cx="110" cy="102" rx="76" ry="18" fill="${dark}" opacity=".18"/>
           <path d="M62 92 C60 52 91 34 111 68 C130 34 160 53 158 92 Z" fill="${light}"/>
           <path d="M86 91 C88 61 102 51 111 70 C121 51 136 61 138 91" fill="none" stroke="${dark}" stroke-width="8" opacity=".65"/>
           <circle cx="110" cy="53" r="11" fill="${accent}"/>`
        : category === "Noodle"
          ? `<ellipse cx="110" cy="100" rx="76" ry="18" fill="${dark}" opacity=".2"/>
             <path d="M54 86 C65 118 155 118 166 86 Z" fill="${light}"/>
             <path d="M67 82 C90 66 123 99 153 78" fill="none" stroke="${accent}" stroke-width="8" stroke-linecap="round"/>
             <path d="M66 92 C92 78 120 108 154 89" fill="none" stroke="${dark}" stroke-width="7" stroke-linecap="round" opacity=".72"/>
             <rect x="138" y="36" width="8" height="56" rx="4" fill="${dark}" transform="rotate(20 142 64)"/>
             <rect x="152" y="36" width="8" height="56" rx="4" fill="${dark}" transform="rotate(20 156 64)"/>`
      : `<rect x="72" y="20" width="76" height="98" rx="12" fill="${light}"/>
         <rect x="82" y="46" width="56" height="56" rx="6" fill="${dark}" opacity=".82"/>
         <rect x="90" y="58" width="40" height="16" fill="#ffffff" opacity=".42"/>
         <path d="M148 54 C185 54 185 94 148 94" fill="none" stroke="${light}" stroke-width="10"/>
         <circle cx="58" cy="32" r="16" fill="#fff7dc" opacity=".82"/>
         <rect x="78" y="102" width="64" height="10" rx="5" fill="${accent}" opacity=".65"/>`;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 140">
      <rect width="220" height="140" fill="${bg}"/>
      ${art}
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
  updateExactCashButton();
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

  summaryTitleText.innerHTML = nameVal
    ? `Order Summary for:<strong>${nameVal}</strong>`
    : "Order Summary";

  const hasItem = Object.values(quantities).some(qty=>qty > 0);
  const contactVal = contactInput ? contactInput.value.trim() : "";
  const needsCustomerFields = Boolean(nameInput || contactInput || timeDropdown);
  const cashValid = !cashInput || Number(cashInput.value || 0) >= currentTotal;
  const valid = needsCustomerFields
    ? nameVal && (!contactInput || normalizeMobileNumber(contactVal)) && hasItem && timeDropdown.value
    : hasItem && cashValid;
  orderButton.disabled = orderSubmitted || !valid;
  orderButton.style.background = valid && !orderSubmitted ? "#1f8f4d" : "#ccc";
}

function updateChange(){
  if(!changeOutput){
    return;
  }

  const cash = Number(cashInput ? cashInput.value || 0 : 0);
  const change = Math.max(0, cash - currentTotal);
  changeOutput.value = `P${change}`;
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

function updateExactCashButton(){
  if(!exactCashButton){
    return;
  }

  exactCashButton.innerText = `P${currentTotal}`;
  exactCashButton.disabled = currentTotal <= 0;
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

  const nameVal = nameInput ? nameInput.value.trim() : "WALK-IN";
  const contactVal = contactInput ? contactInput.value.trim() : "";
  const pickupTime = timeDropdown ? (timeDropdown.value || selectedTime.value) : "POS RW";
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

  if(timeDropdown && !pickupTime){
    alert("Please select an available delivery time.");
    timeDropdown.focus();
    return;
  }

  if(!items.length){
    alert("Please tap a product photo to add an item.");
    return;
  }

  orderSubmitted = true;
  orderButton.disabled = true;
  orderButton.innerText = "Processing...";

  let data;

  try{
    const res = await fetch(timeDropdown ? "/api/orders" : "/api/pos/transactions", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(timeDropdown
        ? {
          customerName:nameVal,
          customerContact:contactVal,
          pickupTime,
          items
        }
        : { items })
    });
    data = await res.json();
  }catch{
    orderSubmitted = false;
    orderButton.disabled = false;
    orderButton.innerText = "Process / New Sale";
    alert("Unable to send order. Please check your internet connection and try again.");
    validate();
    return;
  }

  if(!data.ok){
    orderSubmitted = false;
    orderButton.disabled = false;
    orderButton.innerText = "Process / New Sale";
    alert(data.message || "Unable to send order");
    await generateTimes();
    validate();
    return;
  }

  saveCustomer();
  activeOrderId = data.order.id;
  localStorage.setItem("activeOrderId", activeOrderId);
  activeOrderVisible = false;
  resetOrderForm();

  orderSubmitted = false;
  orderButton.disabled = false;
  orderButton.innerText = "Process / New Sale";
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
  customerStatus.classList.add("hidden");
}

function showCustomerStatus(order){
  if(!activeOrderVisible){
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

  if(order.status === "Ready for Payment and Pickup"){
    notifyCustomer(order, "Pantanan order ready", "Your order is ready for payment and pickup.");
  }
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
  if(!activeOrderId || !activeOrderVisible){
    return;
  }

  const res = await fetch(`/api/orders/${activeOrderId}`);

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
updateNowTime();
generateTimes();
loadSavedCustomer();
updatePaymentVisibility();
updateCashInputWidth();
loadMenu();
checkActiveOrder();
validate();
