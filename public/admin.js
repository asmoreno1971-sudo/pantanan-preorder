let token = localStorage.getItem("adminToken") || "";
let menu = [];
const categories = ["Sandwhich", "Drinks", "Cookies", "Others"];
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
  const res = await fetch("/api/menu");
  menu = await res.json();
  renderEditor();
}

function renderEditor(){
  editorList.innerHTML = "";

  const header = document.createElement("div");
  header.className = "admin-header-row";
  header.innerHTML = `
    <div>Product</div>
    <div>Price</div>
    <div>Category</div>
    <div></div>
  `;
  editorList.appendChild(header);

  menu.forEach((item, index)=>{
    const row = document.createElement("div");
    row.className = "admin-row";
    row.innerHTML = `
      <input value="${item.name}" oninput="updateItem(${index},'name',this.value)">
      <input type="number" min="0" value="${item.price}" oninput="updateItem(${index},'price',this.value)">
      <select onchange="updateItem(${index},'category',this.value)">
        ${categories.map(category=>`<option value="${category}">${category}</option>`).join("")}
      </select>
      <button class="danger-btn" onclick="removeProduct(${index})">Remove</button>
    `;
    editorList.appendChild(row);
    row.querySelector("select").value = item.category || "Others";
  });
}

function updateItem(index, field, value){
  if(field === "price"){
    menu[index][field] = Number(value) || 0;
  }else{
    menu[index][field] = value.trim() || "Untitled Product";
  }
}

function addProduct(){
  const nextNumber = menu.length + 1;

  menu.push({
    id:`new-product-${Date.now()}`,
    name:`New Product ${nextNumber}`,
    price:0,
    theme:"latte",
    category:"Others"
  });

  renderEditor();
  statusText("New product added");
}

function removeProduct(index){
  menu.splice(index, 1);
  renderEditor();
  statusText("Product removed");
}

async function saveMenu(){
  const res = await fetch("/api/menu", {
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      "Authorization":`Bearer ${token}`
    },
    body:JSON.stringify(menu)
  });
  const data = await res.json();

  if(!data.ok){
    statusText(data.message || "Save failed");
    return;
  }

  menu = data.menu;
  renderEditor();
  statusText("Saved");
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

if(token){
  loginBox.classList.add("hidden");
  editorBox.classList.remove("hidden");
  loadMenu();
}
