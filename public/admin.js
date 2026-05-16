let token = localStorage.getItem("adminToken") || "";
let menu = [];
let autoSaveTimer = null;
let isSaving = false;
let pendingSave = false;

const menuDraftKey = "adminMenuDraft";
const categories = ["Sandwiches", "Drinks", "Dimsum", "Noodle", "Other"];
const passwordInput = document.getElementById("password");
const loginBox = document.getElementById("loginPanel");
const editorBox = document.getElementById("editorPanel");
const editorList = document.getElementById("productEditor");
const statusLabel = document.getElementById("status");

async function login(){
  const res = await fetch("/api/admin/login", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ password:passwordInput.value })
  });
  const data = await res.json();

  if(!data.ok){
    statusText("Wrong password");
    return;
  }

  token = data.token;
  localStorage.setItem("adminToken", token);
  loginBox.classList.add("hidden");
  editorBox.classList.remove("hidden");
  statusText("Logged in");
  await loadMenu();
}

async function loadMenu(){
  const res = await fetch(`/api/menu?fresh=${Date.now()}`, { cache:"no-store" });
  menu = await res.json();
  localStorage.removeItem(menuDraftKey);
  menu.forEach(item=>{
    item.category = normalizeCategory(item.category);
  });
  renderEditor();

  if(menu.length === 0){
    statusText("No products loaded. Do not save yet. Refresh after deploy finishes.");
  }else{
    statusText("Loaded saved online products.");
  }
}

function renderEditor(){
  editorList.innerHTML = "";

  menu.forEach((item, index)=>{
    const card = document.createElement("div");
    card.className = "product-card-editor";

    const image = item.image || productFallback(item);
    card.innerHTML = `
      <div class="product-image-editor">
        <img alt="">
      </div>
      <div class="product-fields-editor">
        <label>
          Product name
          <input class="name-input" value="">
        </label>
        <label>
          Price
          <input class="price-input" type="number" min="0" step="1" value="">
        </label>
        <label>
          Category
          <select class="category-input">
            ${categories.map(category=>`<option value="${category}">${category}</option>`).join("")}
          </select>
        </label>
        <label class="image-url-field">
          Picture URL
          <input class="image-input" value="" placeholder="https://...">
        </label>
        <div class="picture-actions">
          <label class="upload-btn">
            Upload picture
            <input class="file-input" type="file" accept="image/*">
          </label>
          <button class="secondary-btn clear-image-btn" type="button">Clear picture</button>
          <button class="danger-btn remove-btn" type="button">Remove</button>
        </div>
      </div>
    `;

    const img = card.querySelector("img");
    img.src = image;
    img.alt = item.name || "Product picture";
    img.addEventListener("error", ()=>{
      img.src = productFallback(item);
    }, { once:true });

    const nameInput = card.querySelector(".name-input");
    const priceInput = card.querySelector(".price-input");
    const categoryInput = card.querySelector(".category-input");
    const imageInput = card.querySelector(".image-input");
    const fileInput = card.querySelector(".file-input");

    nameInput.value = item.name || "";
    priceInput.value = Number(item.price) || 0;
    categoryInput.value = normalizeCategory(item.category);
    imageInput.value = item.image || "";

    nameInput.addEventListener("input", ()=>{
      updateItem(index, "name", nameInput.value);
      img.alt = menu[index].name;
    });
    priceInput.addEventListener("input", ()=>updateItem(index, "price", priceInput.value));
    categoryInput.addEventListener("change", ()=>updateItem(index, "category", categoryInput.value));
    imageInput.addEventListener("input", ()=>{
      updateItem(index, "image", imageInput.value);
      img.src = menu[index].image || productFallback(menu[index]);
    });
    fileInput.addEventListener("change", ()=>uploadImage(index, fileInput, imageInput, img));
    card.querySelector(".clear-image-btn").addEventListener("click", ()=>{
      menu[index].image = "";
      imageInput.value = "";
      img.src = productFallback(menu[index]);
      saveMenuDraft();
      statusText("Picture cleared");
    });
    card.querySelector(".remove-btn").addEventListener("click", ()=>removeProduct(index));

    editorList.appendChild(card);
  });
}

function updateItem(index, field, value){
  if(field === "price"){
    menu[index][field] = Number(value) || 0;
  }else if(field === "name"){
    menu[index][field] = value.trim() || "Untitled Product";
  }else{
    menu[index][field] = value.trim();
  }

  saveMenuDraft();
}

function addProduct(){
  const nextNumber = menu.length + 1;

  menu.push({
    id:`new-product-${Date.now()}`,
    name:`New Product ${nextNumber}`,
    price:0,
    theme:"latte",
    category:"Drinks",
    image:""
  });

  renderEditor();
  saveMenuDraft();
  statusText("New product added");
}

function removeProduct(index){
  menu.splice(index, 1);
  renderEditor();
  saveMenuDraft();
  statusText("Product removed");
}

function uploadImage(index, fileInput, imageInput, img){
  const file = fileInput.files && fileInput.files[0];

  if(!file){
    return;
  }

  const reader = new FileReader();
  reader.onload = ()=>{
    resizeImage(String(reader.result || ""), 900, .82)
      .then(image=>{
        menu[index].image = image;
        imageInput.value = image;
        img.src = image;
        saveMenuDraft();
        statusText("Picture added. Save products to publish it.");
      })
      .catch(()=>{
        statusText("Could not read that picture.");
      });
  };
  reader.readAsDataURL(file);
}

async function saveMenu(){
  if(menu.length === 0){
    statusText("Save blocked: product list is empty. Refresh the page first.");
    return;
  }

  if(isSaving){
    pendingSave = true;
    return;
  }

  isSaving = true;
  statusText("Saving...");

  try{
    const cleanMenu = prepareMenuForSave();
    const res = await fetch("/api/menu", {
      method:"PUT",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer ${token}`
      },
      cache:"no-store",
      body:JSON.stringify(cleanMenu)
    });
    const data = await res.json().catch(()=>({ ok:false, message:"Server did not return JSON." }));

    if(res.status === 401){
      token = "";
      localStorage.removeItem("adminToken");
      loginBox.classList.remove("hidden");
      editorBox.classList.add("hidden");
      statusText("Login expired. Please log in again.");
      isSaving = false;
      return;
    }

    if(!res.ok || !data.ok){
      statusText(data.message || `Save failed (${res.status})`);
      isSaving = false;
      return;
    }

    menu = data.menu;
    const savedAt = Date.now();
    localStorage.setItem("adminMenuServerSavedAt", String(savedAt));
    localStorage.removeItem(menuDraftKey);
    renderEditor();
    await verifyCustomerMenuSync();
  }catch{
    saveMenuDraft();
    statusText("Save failed, but your edits are backed up in this browser. Try Save Products again.");
  }finally{
    isSaving = false;

    if(pendingSave){
      pendingSave = false;
      saveMenu();
    }
  }
}

async function verifyCustomerMenuSync(){
  try{
    const res = await fetch(`/api/menu?view=customer&fresh=${Date.now()}`, { cache:"no-store" });
    const customerMenu = await res.json();
    const savedSignature = menu.map(item=>`${item.id}|${item.name}|${Number(item.price) || 0}|${normalizeCategory(item.category)}|${imageFingerprint(item.image)}`).join("\n");
    const customerSignature = customerMenu.map(item=>`${item.id}|${item.name}|${Number(item.price) || 0}|${normalizeCategory(item.category)}|${item.imageFingerprint || ""}`).join("\n");

    if(savedSignature !== customerSignature){
      statusText("Saved, but customer menu does not match yet. Editing is paused until the server catches up.");
      return;
    }

    statusText(`Saved ${menu.length} products. Customer page is updated.`);
  }catch{
    statusText(`Saved ${menu.length} products. Customer sync check unavailable.`);
  }
}

function imageFingerprint(value){
  const text = String(value || "");
  let hash1 = 0x811c9dc5;
  let hash2 = 0x01000193;

  for(let index = 0; index < text.length; index += 1){
    const code = text.charCodeAt(index);
    hash1 = Math.imul(hash1 ^ code, 0x01000193) >>> 0;
    hash2 = Math.imul(hash2 + code, 0x811c9dc5) >>> 0;
  }

  return text ? `${hash1.toString(16)}${hash2.toString(16)}`.slice(0, 16) : "";
}

async function exportCustomers(){
  const res = await fetch("/api/customers.csv", {
    headers:{ "Authorization":`Bearer ${token}` }
  });

  if(!res.ok){
    statusText("Export failed");
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pantanan-customers.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  statusText("Customer list exported");
}

function statusText(message){
  statusLabel.innerText = message;
}

function saveMenuDraft(autosave = true, savedAt = Date.now()){
  try{
    localStorage.setItem(menuDraftKey, JSON.stringify({
      savedAt,
      items:menu
    }));
    if(autosave){
      scheduleAutoSave();
    }
  }catch{
    statusText("Browser backup is full. Save Products now, or use smaller pictures.");
  }
}

function scheduleAutoSave(){
  if(!token || menu.length === 0){
    return;
  }

  statusText("Saving changes...");
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(()=>{
    saveMenu();
  }, 900);
}

function prepareMenuForSave(){
  return menu.map(item=>({
    ...item,
    category:normalizeCategory(item.category)
  }));
}

function normalizeCategory(category){
  const normalized = category === "Sandwhich" || category === "Sandwich" ? "Sandwiches" : category;
  if(normalized === "Cookies"){
    return "Other";
  }

  return categories.includes(normalized) ? normalized : "Drinks";
}

function productFallback(item){
  const category = normalizeCategory(item.category);
  const palettes = {
    Sandwiches:["#efc486", "#8a5530", "#fff2c7", "#72a35b"],
    Drinks:["#dcae73", "#5b3322", "#fff2dd", "#b78052"],
    Dimsum:["#f2c98f", "#8d5c2f", "#fff3d8", "#c6783d"],
    Noodle:["#f0d17d", "#73502a", "#fff0b8", "#b56b38"],
    Other:["#c8d6c3", "#4d6048", "#f2ead8", "#829b7a"]
  };
  const [bg, dark, light, accent] = palettes[category] || palettes.Other;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 140">
      <rect width="220" height="140" fill="${bg}"/>
      <circle cx="72" cy="72" r="38" fill="${light}"/>
      <rect x="106" y="42" width="72" height="58" rx="14" fill="${dark}" opacity=".82"/>
      <path d="M44 104 C76 82 105 82 140 104" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function resizeImage(src, maxSize, quality){
  return new Promise((resolve, reject)=>{
    const image = new Image();

    image.onload = ()=>{
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));

      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };

    image.onerror = reject;
    image.src = src;
  });
}

if(token){
  loginBox.classList.add("hidden");
  editorBox.classList.remove("hidden");
  loadMenu();
}
