let products = [];
const cart = new Map();

const productRoot = document.getElementById("products");
const cartRoot = document.getElementById("cart");
const totalNode = document.getElementById("total");
const statusNode = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");

const categoryOrder = ["Drinks", "Dimsum", "Noodle", "Sandwich", "Other"];

function peso(value){
  return `₱${Number(value) || 0}`;
}

function normalizeCategory(name){
  const n = String(name || "").toLowerCase();

  if(
    n.includes("nutella") ||
    n.includes("biscoff") ||
    n.includes("pimiento") ||
    n.includes("ham & cheese") ||
    n.includes("grilled cheese") ||
    n.includes("sandwich")
  ){
    return "Sandwich";
  }

  if(
    n.includes("calamansi") ||
    n.includes("pineapple") ||
    n.includes("swakto") ||
    n.includes("mt. dew") ||
    n.includes("water") ||
    n.includes("coffee") ||
    n.includes("latte") ||
    n.includes("americano") ||
    n.includes("milo") ||
    n.includes("matcha")
  ){
    return "Drinks";
  }

  if(
    n.includes("canton") ||
    n.includes("noodle") ||
    n.includes("mami") ||
    n.includes("ramen") ||
    n.includes("pancit")
  ){
    return "Noodle";
  }

  if(
    n.includes("siomai") ||
    n.includes("siopao")
  ){
    return "Dimsum";
  }

  return "Other";
}

function groupProducts(){
  const groups = Object.fromEntries(categoryOrder.map(category=>[category, []]));

  products.forEach(product=>{
    if(String(product.name || "").toLowerCase().includes("sticker")){
      return;
    }

    groups[normalizeCategory(`${product.category || ""} ${product.name || ""}`)].push(product);
  });

  return groups;
}

function renderProducts(){
  productRoot.innerHTML = "";
  const groups = groupProducts();

  categoryOrder.forEach(category=>{
    const items = groups[category].sort((a, b)=>a.name.localeCompare(b.name));

    if(items.length === 0){
      return;
    }

    const box = document.createElement("section");
    box.className = "category-box";

    const title = document.createElement("h2");
    title.className = "category-title";
    title.textContent = category;
    box.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "grid";

    items.forEach(product=>{
      const button = document.createElement("button");
      const fallback = productImage(product);
      const image = product.image || fallback;
      button.type = "button";
      button.className = "product-btn";
      button.innerHTML = `
        <img class="product-img" alt="">
        <span class="product-info">
          <span class="product-name"></span>
          <span class="product-price"></span>
        </span>
      `;
      const img = button.querySelector(".product-img");
      img.src = image;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.addEventListener("error", ()=>{
        img.src = fallback;
      }, { once:true });
      button.querySelector(".product-name").textContent = product.name;
      button.querySelector(".product-price").textContent = peso(product.price);
      button.addEventListener("click", ()=>{
        add(product.id);
        button.classList.add("confirm");
        setTimeout(()=>button.classList.remove("confirm"), 120);
      });
      grid.appendChild(button);
    });

    box.appendChild(grid);
    productRoot.appendChild(box);
  });
}

function productImage(product){
  const category = normalizeCategory(`${product.category || ""} ${product.name || ""}`);
  const palettes = {
    Sandwich:["#efc486", "#8a5530", "#fff2c7", "#72a35b"],
    Drinks:["#dcae73", "#5b3322", "#fff2dd", "#b78052"],
    Dimsum:["#f2c98f", "#8d5c2f", "#fff3d8", "#c6783d"],
    Noodle:["#f0d17d", "#73502a", "#fff0b8", "#b56b38"],
    Other:["#c8d6c3", "#4d6048", "#f2ead8", "#829b7a"]
  };
  const [bg, dark, light, accent] = palettes[category] || palettes.Other;
  const art = category === "Sandwich"
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
      : category === "Drinks"
        ? `<rect x="72" y="20" width="76" height="98" rx="12" fill="${light}"/>
           <rect x="82" y="46" width="56" height="56" rx="6" fill="${dark}" opacity=".82"/>
           <rect x="90" y="58" width="40" height="16" fill="#ffffff" opacity=".42"/>
           <path d="M148 54 C185 54 185 94 148 94" fill="none" stroke="${light}" stroke-width="10"/>
           <circle cx="58" cy="32" r="16" fill="#fff7dc" opacity=".82"/>
           <rect x="78" y="102" width="64" height="10" rx="5" fill="${accent}" opacity=".65"/>`
        : `<circle cx="78" cy="76" r="42" fill="${light}"/>
           <circle cx="138" cy="68" r="44" fill="${light}"/>
           <circle cx="66" cy="61" r="6" fill="${dark}"/>
           <circle cx="91" cy="86" r="7" fill="${dark}"/>
           <circle cx="125" cy="48" r="6" fill="${dark}"/>
           <circle cx="153" cy="74" r="7" fill="${dark}"/>
           <circle cx="139" cy="96" r="5" fill="${dark}"/>`;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 140">
      <rect width="220" height="140" fill="${bg}"/>
      ${art}
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function add(id){
  cart.set(id, (cart.get(id) || 0) + 1);
  renderCart();
}

function increase(id){
  add(id);
}

function decrease(id){
  const qty = (cart.get(id) || 0) - 1;

  if(qty <= 0){
    cart.delete(id);
  }else{
    cart.set(id, qty);
  }

  renderCart();
}

function cartItems(){
  return [...cart.entries()]
    .map(([id, qty])=>{
      const product = products.find(item=>item.id === id);
      return product ? { ...product, qty, subtotal:qty * product.price } : null;
    })
    .filter(Boolean);
}

function renderCart(){
  const items = cartItems();
  const total = items.reduce((sum, item)=>sum + item.subtotal, 0);
  totalNode.textContent = peso(total);
  saveBtn.disabled = items.length === 0;

  if(items.length === 0){
    cartRoot.className = "cart empty";
    cartRoot.textContent = "No items yet";
    return;
  }

  cartRoot.className = "cart";
  cartRoot.innerHTML = "";

  items.forEach(item=>{
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <div class="cart-item">
        <span class="cart-name"></span>
        <span class="cart-subtotal"></span>
      </div>
      <div class="qty-controls">
        <button class="qty-btn decrease" type="button">−</button>
        <span class="qty"></span>
        <button class="qty-btn increase" type="button">+</button>
      </div>
    `;
    row.querySelector(".cart-name").textContent = item.name;
    row.querySelector(".cart-subtotal").textContent = `${peso(item.price)} x ${item.qty} = ${peso(item.subtotal)}`;
    row.querySelector(".qty").textContent = item.qty;
    row.querySelector(".decrease").addEventListener("click", ()=>decrease(item.id));
    row.querySelector(".increase").addEventListener("click", ()=>increase(item.id));
    cartRoot.appendChild(row);
  });
}

function setStatus(message){
  statusNode.textContent = message;
}

async function save(){
  const items = cartItems().map(item=>({ id:item.id, qty:item.qty }));

  if(items.length === 0){
    setStatus("No items to save.");
    return;
  }

  saveBtn.disabled = true;
  setStatus("Saving transaction...");

  const response = await fetch("/api/pos/transactions", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ items })
  });
  const data = await response.json();

  if(!data.ok){
    saveBtn.disabled = false;
    setStatus(data.message || "Save failed.");
    return;
  }

  cart.clear();
  renderCart();
  setStatus(`Saved POS RW transaction #${String(data.order.orderNumber).padStart(3, "0")}.`);
}

async function cancelLast(){
  setStatus("Cancelling last POS RW transaction...");
  const response = await fetch("/api/pos/cancel-last", { method:"POST" });
  const data = await response.json();

  if(!data.ok){
    setStatus(data.message || "Cancel failed.");
    return;
  }

  setStatus(`Cancelled transaction #${String(data.order.orderNumber).padStart(3, "0")}.`);
}

function clearCart(){
  cart.clear();
  renderCart();
  setStatus("Cart cleared.");
}

function updateDateTime(){
  document.getElementById("datetime").textContent = new Date().toLocaleString("en-PH");
}

async function init(){
  saveBtn.disabled = true;
  document.getElementById("saveBtn").addEventListener("click", save);
  document.getElementById("cancelLastBtn").addEventListener("click", cancelLast);
  document.getElementById("clearBtn").addEventListener("click", clearCart);

  updateDateTime();
  setInterval(updateDateTime, 1000);

  const response = await fetch("/api/menu");
  products = await response.json();
  renderProducts();
  renderCart();
}

init().catch(()=>{
  setStatus("Could not load products.");
});
