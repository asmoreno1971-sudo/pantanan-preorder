let token = localStorage.getItem("adminToken") || "";
let menu = [];
let isSaving = false;
let isLoadingMenu = false;

const menuDraftKey = "adminMenuDraft";
const menuBackupKey = "adminMenuLastGood";
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

async function verifyAdminSession(){
  if(!token){
    return false;
  }

  try{
    const res = await fetch("/api/admin/session", {
      cache:"no-store",
      headers:{ "Authorization":`Bearer ${token}` }
    });
    return res.ok;
  }catch{
    return false;
  }
}

function showLogin(message){
  token = "";
  localStorage.removeItem("adminToken");
  loginBox.classList.remove("hidden");
  editorBox.classList.add("hidden");
  statusText(message);
}

async function loadMenu(){
  if(isLoadingMenu){
    return;
  }

  isLoadingMenu = true;
  try{
    const res = await fetch(`/api/menu?fresh=${Date.now()}`, { cache:"no-store" });
    const serverMenu = await res.json();
    const savedAt = Number(localStorage.getItem("adminMenuServerSavedAt") || 0);
    const draft = readStoredMenu(menuDraftKey);
    const backup = readStoredMenu(menuBackupKey);
    const draftIsNewer = draft && draft.savedAt > savedAt;
    const backupHasMorePictures = backup && countProductPictures(backup.items) > countProductPictures(serverMenu);

    if(draftIsNewer){
      menu = draft.items;
      statusText("Restored your unsaved browser backup. Press Save Products when ready.");
    }else if(backupHasMorePictures){
      menu = backup.items;
      statusText("Restored your last saved browser backup because the server menu lost pictures. Press Save Products.");
    }else{
      menu = serverMenu;
      localStorage.removeItem(menuDraftKey);
    }

    menu.forEach(item=>{
      item.category = normalizeCategory(item.category);
    });
    renderEditor();

    if(menu.length === 0){
      statusText("No products loaded. Do not save yet. Refresh after deploy finishes.");
    }else if(!draftIsNewer && !backupHasMorePictures){
      statusText("Loaded saved online products. Admin will not auto-reload while you edit.");
      scrollAdminToBottom();
    }
  }finally{
    isLoadingMenu = false;
  }
}

function scrollAdminToBottom(){
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      window.scrollTo({ top:document.documentElement.scrollHeight, behavior:"auto" });
    });
  });
}

function renderEditor(){
  editorList.innerHTML = "";

  menu.forEach((item, index)=>{
    const card = document.createElement("div");
    card.className = "product-card-editor";

    card.innerHTML = `
      <div class="product-image-editor">
        <img alt="">
        <span>No picture</span>
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
          <input class="image-input" value="" placeholder="No picture set">
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
    img.alt = item.name || "Product picture";
    setEditorImage(card.querySelector(".product-image-editor"), img, item.image);
    img.addEventListener("error", ()=>{
      setEditorImage(card.querySelector(".product-image-editor"), img, "");
    });

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
      setEditorImage(card.querySelector(".product-image-editor"), img, menu[index].image);
    });
    fileInput.addEventListener("change", ()=>uploadImage(index, fileInput, imageInput, img));
    card.querySelector(".clear-image-btn").addEventListener("click", ()=>{
      menu[index].image = "";
      imageInput.value = "";
      setEditorImage(card.querySelector(".product-image-editor"), img, "");
      saveMenuDraft();
      statusText("Picture cleared. Press Save Products when ready.");
    });
    card.querySelector(".remove-btn").addEventListener("click", ()=>removeProduct(index));

    editorList.appendChild(card);
  });
}

function setEditorImage(preview, img, image){
  if(image){
    preview.classList.remove("no-image");
    img.style.display = "";
    img.src = image;
    return;
  }

  preview.classList.add("no-image");
  img.removeAttribute("src");
  img.style.display = "none";
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
  statusText("New product added. Press Save Products when ready.");
}

function removeProduct(index){
  menu.splice(index, 1);
  renderEditor();
  saveMenuDraft();
  statusText("Product removed. Press Save Products when ready.");
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
        setEditorImage(img.closest(".product-image-editor"), img, image);
        saveMenuDraft();
        statusText("Picture loaded. Press Save Products when ready.");
        return true;
      })
      .catch(()=>{
        statusText("Could not read that picture.");
      });
  };
  reader.readAsDataURL(file);
}

async function saveMenu(options = {}){
  if(menu.length === 0){
    statusText("Save blocked: product list is empty. Refresh the page first.");
    return false;
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
      showLogin("Login expired. Please log in again before editing products.");
      isSaving = false;
      return false;
    }

    if(!res.ok || !data.ok){
      statusText(data.message || `Save failed (${res.status})`);
      isSaving = false;
      return false;
    }

    menu = data.menu;
    const savedAt = Date.now();
    localStorage.setItem("adminMenuServerSavedAt", String(savedAt));
    saveStoredMenu(menuBackupKey, savedAt, menu);
    localStorage.removeItem(menuDraftKey);
    renderEditor();
    const synced = await verifyCustomerMenuSync(options);
    return synced;
  }catch{
    saveMenuDraft();
    statusText("Save failed, but your edits are backed up in this browser. Try Save Products again.");
    return false;
  }finally{
    isSaving = false;
  }
}

async function verifyCustomerMenuSync(options = {}){
  try{
    const [customerRes, cashierRes] = await Promise.all([
      fetch(`/api/menu?view=customer&fresh=${Date.now()}`, { cache:"no-store" }),
      fetch(`/api/menu?view=cashier&fresh=${Date.now()}`, { cache:"no-store" })
    ]);

    if(customerRes.headers.get("X-Menu-Source") !== "admin-persistent-menu" || cashierRes.headers.get("X-Menu-Source") !== "admin-persistent-menu"){
      statusText("Save rejected: customer or cashier is using the wrong menu source.");
      return false;
    }

    const [customerMenu, cashierMenu] = await Promise.all([
      customerRes.json(),
      cashierRes.json()
    ]);
    const savedSignature = publicMenuSignature(menu);
    const customerSignature = publicMenuSignature(customerMenu);
    const cashierSignature = publicMenuSignature(cashierMenu);

    if(savedSignature !== customerSignature || savedSignature !== cashierSignature){
      statusText("Save rejected: customer and cashier menus do not match Admin yet.");
      return false;
    }

    if(options.verifyImageForId){
      const customerItem = customerMenu.find(product=>product.id === options.verifyImageForId);
      const cashierItem = cashierMenu.find(product=>product.id === options.verifyImageForId);
      const expected = imageFingerprint(options.verifyImage);

      if(!customerItem || !cashierItem || customerItem.imageFingerprint !== expected || cashierItem.imageFingerprint !== expected){
        statusText("Picture upload did not stick in customer and cashier. Please log in again and retry.");
        return false;
      }
    }

    statusText(`Saved ${menu.length} products. Customer and Cashier pages are updated.`);
    return true;
  }catch{
    statusText("Save rejected: customer/cashier sync check unavailable.");
    return false;
  }
}

function publicMenuSignature(items){
  return (Array.isArray(items) ? items : []).map(item=>{
    const imageKey = imageFingerprint(item.image);
    return `${item.id}|${item.name}|${Number(item.price) || 0}|${normalizeCategory(item.category)}|${imageKey}`;
  }).join("\n");
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

function saveMenuDraft(savedAt = Date.now()){
  saveStoredMenu(menuDraftKey, savedAt, menu);
}

function saveStoredMenu(key, savedAt, items){
  try{
    localStorage.setItem(key, JSON.stringify({
      savedAt,
      items
    }));
  }catch{
    statusText("Browser backup is full. Save Products now, or use smaller pictures.");
  }
}

function readStoredMenu(key){
  try{
    const stored = JSON.parse(localStorage.getItem(key) || "null");

    if(!stored || !Array.isArray(stored.items) || stored.items.length === 0){
      return null;
    }

    return stored;
  }catch{
    localStorage.removeItem(key);
    return null;
  }
}

function countProductPictures(items){
  return (Array.isArray(items) ? items : []).filter(item=>String(item.image || "").trim()).length;
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

async function startAdmin(){
  if(!token){
    return;
  }

  if(!await verifyAdminSession()){
    showLogin("Login expired after server restart. Please log in again before editing products.");
    return;
  }

  loginBox.classList.add("hidden");
  editorBox.classList.remove("hidden");
  await loadMenu();
}

startAdmin();
