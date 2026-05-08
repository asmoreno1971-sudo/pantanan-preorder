let menu = [];
const quantities = {};
const categories = ["Sandwiches", "Drinks", "Cookies", "Others"];
const openCategories = new Set(categories);
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
const modal = document.getElementById("successModal");
const successTitle = document.getElementById("successTitle");
const successText = document.getElementById("successText");
const customerStatus = document.getElementById("customerStatus");
const customerStatusTitle = document.getElementById("customerStatusTitle");
const customerStatusText = document.getElementById("customerStatusText");
const notifyButton = document.getElementById("notifyBtn");
let activeOrderId = localStorage.getItem("activeOrderId") || "";
let lastNotifiedStatus = localStorage.getItem("lastNotifiedStatus") || "";
let orderSubmitted = false;

function loadSavedCustomer(){
  nameInput.value = localStorage.getItem("customerNickname") || "";
  contactInput.value = localStorage.getItem("customerContact") || "";
}

function saveCustomer(){
  localStorage.setItem("customerNickname", nameInput.value.trim());
  localStorage.setItem("customerContact", contactInput.value.trim());
}

async function loadMenu(){
  const res = await fetch("/api/menu");
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

function generateTimes(){
  let hasAvailableSlot = false;
  const now = new Date();
  now.setMinutes(now.getMinutes() + 30);

  for(let i = 510; i <= 990; i += 15){
    const slot = new Date();
    slot.setHours(Math.floor(i / 60), i % 60);

    if(slot < now){
      continue;
    }

    const h = slot.getHours();
    const ap = h >= 12 ? "PM" : "AM";
    const dh = h % 12 || 12;
    const dm = slot.getMinutes().toString().padStart(2,"0");
    const t = `${dh}:${dm} ${ap}`;
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

timeDropdown.onchange = function(){
  selectedTime.value = this.value;
  summaryTimeText.innerHTML = this.value ? `<strong>${this.value}</strong>` : "--";
  validate();
};

nameInput.addEventListener("input", function(){
  validate();
  saveCustomer();
});

contactInput.addEventListener("input", function(){
  validate();
  saveCustomer();
});

document.addEventListener("keydown", function(e){
  if(e.key !== "Enter"){
    return;
  }

  const focusOrder = [
    nameInput,
    contactInput,
    timeDropdown,
    ...document.querySelectorAll(".img-wrap, .cancel-btn"),
    orderButton
  ];
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
    const items = menu.filter(item=>normalizeCategory(item.category) === category);

    const isOpen = openCategories.has(category);
    const section = document.createElement("div");
    section.className = "category-section";
    section.innerHTML = `
      <button class="category-toggle" onclick="toggleCategory('${category}')">
        <span>${category}</span>
        <span>${isOpen ? "Hide" : "Show"}</span>
      </button>
      <div class="category-items ${isOpen ? "" : "hidden"}"></div>
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
      row.className = "menu-row";
      const fallback = productImage(item);
      const image = item.image || fallback;
      row.innerHTML = `
        <div class="img-wrap" role="button" tabindex="0" onclick="changeQty('${item.id}',1)" onkeydown="addFromImage(event,'${item.id}')">
          <img class="product-img" src="${image}" alt="${item.name}" onerror="this.onerror=null;this.src='${fallback}'">
          <div class="overlay-name ${overlayClass(item.category)}">${item.name}</div>
        </div>

        <div class="controls">
          <div id="q-${item.id}" class="qty">${quantities[item.id]}</div>
          <button class="cancel-btn" onclick="changeQty('${item.id}',-1)">Cancel</button>
        </div>

        <div class="price-group">
          x P${item.price} =
          <span id="s-${item.id}" class="subtotal">P0</span>
        </div>
      `;

      categoryItems.appendChild(row);
    });
  });
}

function toggleCategory(category){
  if(openCategories.has(category)){
    openCategories.delete(category);
  }else{
    openCategories.add(category);
  }

  renderMenu();
}

function overlayClass(category){
  const normalized = normalizeCategory(category);

  if(normalized === "Sandwiches"){
    return "sandwich-overlay";
  }

  if(normalized === "Cookies"){
    return "cookie-overlay";
  }

  return "";
}

function normalizeCategory(category){
  return category === "Sandwhich" || category === "Sandwich" ? "Sandwiches" : category || "Others";
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
    Cookies:["#c9854d", "#5f341f", "#f5c982", "#3f2418"],
    Others:["#c8d6c3", "#4d6048", "#f2ead8", "#829b7a"]
  };
  const [bg, dark, light, accent] = palettes[category] || palettes.Others;
  const art = category === "Sandwiches"
    ? `<path d="M34 88 L110 24 L186 88 Z" fill="${light}"/>
       <path d="M48 86 L110 39 L172 86 Z" fill="${accent}"/>
       <path d="M58 88 L110 51 L162 88 Z" fill="${dark}" opacity=".8"/>
       <rect x="46" y="86" width="128" height="20" rx="8" fill="${light}"/>
       <circle cx="68" cy="36" r="12" fill="#fff7dc" opacity=".8"/>`
    : category === "Cookies"
      ? `<circle cx="78" cy="76" r="42" fill="${light}"/>
         <circle cx="138" cy="68" r="44" fill="${light}"/>
         <circle cx="66" cy="61" r="6" fill="${dark}"/>
         <circle cx="91" cy="86" r="7" fill="${dark}"/>
         <circle cx="125" cy="48" r="6" fill="${dark}"/>
         <circle cx="153" cy="74" r="7" fill="${dark}"/>
         <circle cx="139" cy="96" r="5" fill="${dark}"/>`
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
  updateTotal();
  validate();
}

function updateTotal(){
  let total = 0;

  menu.forEach(item=>{
    const sub = quantities[item.id] * item.price;
    total += sub;
    document.getElementById(`s-${item.id}`).innerText = `P${sub}`;
  });

  updateSummary(total);
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
  nameInput.value = nameInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const nameVal = nameInput.value.trim();

  summaryTitleText.innerHTML = nameVal
    ? `Order Summary for:<strong>${nameVal}</strong>`
    : "Order Summary";

  const hasItem = Object.values(quantities).some(qty=>qty > 0);
  const contactVal = contactInput.value.trim();
  const valid = nameVal && contactVal && hasItem && timeDropdown.value && !orderSubmitted;
  orderButton.disabled = orderSubmitted;
  orderButton.style.background = valid || !orderSubmitted ? "#6f4e37" : "#ccc";
}

async function openSummary(){
  const nameVal = nameInput.value.trim();
  const contactVal = contactInput.value.trim();
  const pickupTime = timeDropdown.value || selectedTime.value;
  const items = menu
    .filter(item=>quantities[item.id] > 0)
    .map(item=>({ id:item.id, qty:quantities[item.id] }));

  if(!nameVal){
    alert("Please enter your nickname.");
    nameInput.focus();
    return;
  }

  if(!contactVal){
    alert("Please enter your Viber/WhatsApp number.");
    contactInput.focus();
    return;
  }

  if(!pickupTime){
    alert("Please select an available pickup time.");
    timeDropdown.focus();
    return;
  }

  if(!items.length){
    alert("Please tap a product photo to add an item.");
    return;
  }

  const res = await fetch("/api/orders", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({
      customerName:nameVal,
      customerContact:contactVal,
      pickupTime,
      items
    })
  });
  const data = await res.json();

  if(!data.ok){
    alert(data.message || "Unable to send order");
    return;
  }

  saveCustomer();
  activeOrderId = data.order.id;
  localStorage.setItem("activeOrderId", activeOrderId);
  showCustomerStatus(data.order);
  resetOrderForm();

  const displayNumber = String(data.order.orderNumber || data.order.id.slice(-3)).padStart(3, "0");
  successTitle.innerText = `Order #${displayNumber}`;
  successText.innerText = "Your order has been sent. Please wait for kitchen confirmation.";
  modal.classList.add("show");
  orderSubmitted = true;
  orderButton.innerText = "Order Sent";
  validate();
}

function resetOrderForm(){
  nameInput.value = "";
  contactInput.value = "";
  timeDropdown.value = "";
  selectedTime.value = "";
  summaryTimeText.innerText = "--";

  Object.keys(quantities).forEach(id=>{
    quantities[id] = 0;
  });

  updateTotal();
  summaryTitleText.innerHTML = "Order Summary";
}

function closeSuccessModal(){
  modal.classList.remove("show");
}

function dismissCustomerStatus(){
  activeOrderId = "";
  localStorage.removeItem("activeOrderId");
  localStorage.removeItem("lastNotifiedStatus");
  lastNotifiedStatus = "";
  customerStatus.classList.add("hidden");
}

function showCustomerStatus(order){
  const message = {
    "Order Sent":"Your order has been sent. Please wait for kitchen confirmation.",
    "Preparing Order":"Your order is now being prepared.",
    "Ready for Payment and Pickup":"Your order is ready for payment and pickup."
  }[order.status] || order.status;

  const displayNumber = String(order.orderNumber || order.id.slice(-3)).padStart(3, "0");
  customerStatusTitle.innerText = `Order #${displayNumber}`;
  customerStatusText.innerText = message;
  customerStatus.classList.remove("hidden");
  updateNotifyButton();

  if(order.status === "Ready for Payment and Pickup"){
    notifyCustomer(order, "Pantanan order ready", "Your order is ready for payment and pickup.");
  }
}

function enableCustomerNotifications(){
  if(!("Notification" in window)){
    alert("Notifications are not supported on this browser.");
    return;
  }

  Notification.requestPermission().then(updateNotifyButton);
}

function updateNotifyButton(){
  if(!notifyButton || !("Notification" in window)){
    return;
  }

  if(Notification.permission === "granted"){
    notifyButton.innerText = "Phone Alert Enabled";
    notifyButton.classList.add("enabled");
  }else{
    notifyButton.innerText = "Enable Phone Alert";
    notifyButton.classList.remove("enabled");
  }
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
loadMenu();
checkActiveOrder();
updateNotifyButton();
validate();
