const accountRows = document.getElementById("accountRows");
const accountStatus = document.getElementById("accountStatus");
const accountDialog = document.getElementById("accountDialog");
const accountForm = document.getElementById("accountForm");
const originalUsername = document.getElementById("originalUsername");
const displayNameInput = document.getElementById("teacherDisplayName");
const usernameInput = document.getElementById("accountUsername");
const pinInput = document.getElementById("accountPin");
const pinLabel = document.getElementById("pinLabel");
const pinHelp = document.getElementById("pinHelp");
const dialogTitle = document.getElementById("accountDialogTitle");
const saveButton = document.getElementById("saveAccountButton");
const formStatus = document.getElementById("formStatus");
let accounts = [];

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function apiRequest(url, options = {}){
  const response = await fetch(url, {
    ...options,
    headers:{ "Content-Type":"application/json", ...(options.headers || {}) }
  });
  const data = await response.json();
  if(!response.ok || !data.ok){
    throw new Error(data.message || "Teacher account request failed.");
  }
  return data;
}

async function loadAccounts(){
  try{
    const data = await apiRequest("/api/teacher-accounts", { cache:"no-store" });
    accounts = data.accounts || [];
    renderAccounts();
    accountStatus.textContent = `${accounts.length} registered teacher account${accounts.length === 1 ? "" : "s"}`;
  }catch(error){
    accountStatus.textContent = error.message;
    accountRows.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderAccounts(){
  accountRows.innerHTML = accounts.map(account=>`
    <tr>
      <td><strong>${escapeHtml(account.displayName)}</strong></td>
      <td>${escapeHtml(account.username)}</td>
      <td><span class="role-badge">${account.role === "admin" ? "Administrator" : "Teacher"}</span></td>
      <td><span class="state-badge ${account.active ? "" : "disabled"}">${account.active ? "Active" : "Disabled"}</span></td>
      <td>
        <div class="row-actions">
          <button type="button" data-action="edit" data-username="${escapeHtml(account.username)}">Edit / Reset PIN</button>
          ${account.role !== "admin" ? `<button type="button" data-action="toggle" data-username="${escapeHtml(account.username)}">${account.active ? "Disable" : "Enable"}</button>` : ""}
          ${account.role !== "admin" ? `<button class="danger" type="button" data-action="delete" data-username="${escapeHtml(account.username)}">Delete</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("");
}

function openCreateDialog(){
  accountForm.reset();
  originalUsername.value = "";
  usernameInput.disabled = false;
  pinInput.required = true;
  pinLabel.textContent = "4-Digit PIN *";
  pinHelp.textContent = "Give this temporary PIN privately to the teacher.";
  dialogTitle.textContent = "Add Teacher";
  saveButton.textContent = "Create Account";
  formStatus.textContent = "";
  accountDialog.showModal();
  displayNameInput.focus();
}

function openEditDialog(account){
  accountForm.reset();
  originalUsername.value = account.username;
  displayNameInput.value = account.displayName;
  usernameInput.value = account.username;
  usernameInput.disabled = true;
  pinInput.required = false;
  pinLabel.textContent = "New 4-Digit PIN";
  pinHelp.textContent = "Leave blank to keep the current PIN.";
  dialogTitle.textContent = "Edit Teacher Account";
  saveButton.textContent = "Save Changes";
  formStatus.textContent = "";
  accountDialog.showModal();
  displayNameInput.focus();
}

function closeDialog(){
  if(!saveButton.disabled){
    accountDialog.close();
  }
}

pinInput.addEventListener("input", ()=>{
  pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 4);
});

usernameInput.addEventListener("input", ()=>{
  usernameInput.value = usernameInput.value.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "");
});

accountForm.addEventListener("submit", async event=>{
  event.preventDefault();
  formStatus.textContent = "";
  const editing = Boolean(originalUsername.value);
  const pin = pinInput.value.trim();
  if((!editing || pin) && !/^\d{4}$/.test(pin)){
    formStatus.textContent = "PIN must contain exactly 4 digits.";
    pinInput.focus();
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";
  try{
    const body = {
      displayName:displayNameInput.value.trim()
    };
    if(!editing){
      body.username = usernameInput.value.trim();
      body.pin = pin;
    }else if(pin){
      body.pin = pin;
    }
    await apiRequest(
      editing ? `/api/teacher-accounts/${encodeURIComponent(originalUsername.value)}` : "/api/teacher-accounts",
      { method:editing ? "PUT" : "POST", body:JSON.stringify(body) }
    );
    accountDialog.close();
    await loadAccounts();
    accountStatus.textContent = editing ? "Teacher account updated." : "Teacher account created.";
  }catch(error){
    formStatus.textContent = error.message;
  }finally{
    saveButton.disabled = false;
    saveButton.textContent = editing ? "Save Changes" : "Create Account";
  }
});

accountRows.addEventListener("click", async event=>{
  const button = event.target.closest("[data-action]");
  if(!button){
    return;
  }
  const account = accounts.find(item=>item.username === button.dataset.username);
  if(!account){
    return;
  }

  if(button.dataset.action === "edit"){
    openEditDialog(account);
    return;
  }

  if(button.dataset.action === "toggle"){
    try{
      await apiRequest(`/api/teacher-accounts/${encodeURIComponent(account.username)}`, {
        method:"PUT",
        body:JSON.stringify({ active:!account.active })
      });
      await loadAccounts();
    }catch(error){
      accountStatus.textContent = error.message;
    }
    return;
  }

  if(button.dataset.action === "delete" && window.confirm(`Delete the login for ${account.displayName}?`)){
    try{
      await apiRequest(`/api/teacher-accounts/${encodeURIComponent(account.username)}`, { method:"DELETE" });
      await loadAccounts();
    }catch(error){
      accountStatus.textContent = error.message;
    }
  }
});

document.getElementById("addTeacherButton").addEventListener("click", openCreateDialog);
document.getElementById("closeAccountDialog").addEventListener("click", closeDialog);
document.getElementById("cancelAccountDialog").addEventListener("click", closeDialog);
loadAccounts();
