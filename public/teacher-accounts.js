const accountRows = document.getElementById("accountRows");
const accountStatus = document.getElementById("accountStatus");
const accountDialog = document.getElementById("accountDialog");
const accountForm = document.getElementById("accountForm");
const originalUsername = document.getElementById("originalUsername");
const displayNameInput = document.getElementById("teacherDisplayName");
const pinInput = document.getElementById("accountPin");
const pinLabel = document.getElementById("pinLabel");
const pinHelp = document.getElementById("pinHelp");
const dialogTitle = document.getElementById("accountDialogTitle");
const saveButton = document.getElementById("saveAccountButton");
const formStatus = document.getElementById("formStatus");
const adminUnlockDialog = document.getElementById("adminUnlockDialog");
const adminUnlockForm = document.getElementById("adminUnlockForm");
const adminUnlockPassword = document.getElementById("adminUnlockPassword");
const adminUnlockButton = document.getElementById("adminUnlockButton");
const adminUnlockError = document.getElementById("adminUnlockError");
let accounts = [];
let teacherDirectory = [];

function escapeHtml(value){
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function apiRequest(url, options = {}){
  const controller = new AbortController();
  const timeout = window.setTimeout(()=>controller.abort(),3000);
  try{
    const response = await fetch(url, {
      ...options,
      headers:{ "Content-Type":"application/json", ...(options.headers || {}) },
      signal:controller.signal
    });
    const data = await response.json();
    if(!response.ok || !data.ok){
      throw new Error(data.message || "Teacher account request failed.");
    }
    return data;
  }finally{
    window.clearTimeout(timeout);
  }
}

function isConnectionFailure(error){
  return !navigator.onLine || error instanceof TypeError || error?.name === "AbortError";
}

function showOfflineAccountMessage(){
  accountStatus.textContent = "Teacher account administration requires internet. The rest of the learner app remains available offline.";
  accountRows.innerHTML = `<tr><td colspan="5">Reconnect to manage teacher logins and PINs.</td></tr>`;
  document.getElementById("addTeacherButton").disabled = true;
}

async function loadAccounts(){
  try{
    const data = await apiRequest("/api/teacher-accounts", { cache:"no-store" });
    accounts = data.accounts || [];
    renderTeacherOptions();
    renderAccounts();
    accountStatus.textContent = `${accounts.length} registered teacher account${accounts.length === 1 ? "" : "s"}`;
  }catch(error){
    accountStatus.textContent = error.message;
    accountRows.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function loadTeacherDirectory(){
  try{
    const data = await apiRequest("/api/teacher-directory", { cache:"no-store" });
    teacherDirectory = data.teachers || [];
    renderTeacherOptions();
  }catch(error){
    accountStatus.textContent = error.message;
  }
}

function renderTeacherOptions(selected = ""){
  const registered = new Set(accounts.map(account=>account.username));
  const options = teacherDirectory
    .filter(teacher=>teacher.displayName === selected || !registered.has(teacher.username))
    .map(teacher=>`<option value="${escapeHtml(teacher.displayName)}">${escapeHtml(teacher.displayName)}</option>`)
    .join("");
  const selectedOption = selected && !teacherDirectory.some(teacher=>teacher.displayName === selected)
    ? `<option value="${escapeHtml(selected)}">${escapeHtml(selected)}</option>`
    : "";
  displayNameInput.innerHTML = `<option value="">Select teacher</option>${selectedOption}${options}`;
  displayNameInput.value = selected;
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
  displayNameInput.disabled = false;
  renderTeacherOptions();
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
  renderTeacherOptions(account.displayName);
  displayNameInput.disabled = true;
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

adminUnlockDialog.addEventListener("cancel", event=>event.preventDefault());
adminUnlockPassword.addEventListener("input", ()=>{
  adminUnlockPassword.value = adminUnlockPassword.value.replace(/\D/g, "").slice(0, 4);
});
adminUnlockForm.addEventListener("submit", async event=>{
  event.preventDefault();
  adminUnlockError.textContent = "";
  if(!/^\d{4}$/.test(adminUnlockPassword.value)){
    adminUnlockError.textContent = "Enter the 4-digit password.";
    adminUnlockPassword.focus();
    return;
  }

  adminUnlockButton.disabled = true;
  adminUnlockButton.textContent = "Unlocking...";
  try{
    await apiRequest("/api/teacher-admin-unlock", {
      method:"POST",
      body:JSON.stringify({ password:adminUnlockPassword.value })
    });
    adminUnlockDialog.close();
    adminUnlockForm.reset();
    await Promise.all([loadTeacherDirectory(), loadAccounts()]);
  }catch(error){
    adminUnlockError.textContent = error.message;
    adminUnlockPassword.value = "";
    adminUnlockPassword.focus();
  }finally{
    adminUnlockButton.disabled = false;
    adminUnlockButton.textContent = "Unlock Teacher Accounts";
  }
});

async function initializeTeacherAccounts(){
  if(!navigator.onLine){
    showOfflineAccountMessage();
    return;
  }
  try{
    const session = await apiRequest("/api/teacher-session", { cache:"no-store" });
    if(session.adminUnlocked){
      await Promise.all([loadTeacherDirectory(), loadAccounts()]);
      return;
    }
  }catch(error){
    if(isConnectionFailure(error)){
      showOfflineAccountMessage();
      return;
    }
    window.location.replace("/login?next=/teacher-accounts");
    return;
  }
  adminUnlockDialog.showModal();
  adminUnlockPassword.focus();
}

if(window.teacherEntryAllowed !== false){
  initializeTeacherAccounts();
}
