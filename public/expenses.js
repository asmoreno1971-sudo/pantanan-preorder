const expenseDate = document.getElementById("expenseDate");
const expenseFilterDate = document.getElementById("expenseFilterDate");
const expenseItem = document.getElementById("expenseItem");
const expenseAmount = document.getElementById("expenseAmount");
const expenseRows = document.getElementById("expenseRows");
const expenseStatus = document.getElementById("expenseStatus");
const expenseTotal = document.getElementById("expenseTotal");

function todayValue(){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function loadExpenses(){
  expenseStatus.innerText = "Loading...";

  try{
    const res = await fetch(`/api/expenses?date=${encodeURIComponent(expenseFilterDate.value)}`, {
      cache:"no-store"
    });
    const data = await res.json();

    if(!data.ok){
      expenseStatus.innerText = data.message || "Unable to load expenses";
      return;
    }

    renderExpenses(data.expenses || [], data.total || 0);
    expenseStatus.innerText = `Updated ${currentTimeText()}`;
  }catch{
    expenseStatus.innerText = "Offline. Try again.";
  }
}

async function saveExpense(event){
  event.preventDefault();
  expenseStatus.innerText = "Saving...";

  const body = {
    date:expenseDate.value,
    item:expenseItem.value.trim(),
    amount:Number(expenseAmount.value) || 0
  };

  try{
    const res = await fetch("/api/expenses", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(body)
    });
    const data = await res.json();

    if(!data.ok){
      expenseStatus.innerText = data.message || "Unable to save expense";
      return;
    }

    expenseItem.value = "";
    expenseAmount.value = "";
    expenseFilterDate.value = body.date;
    await loadExpenses();
    expenseItem.focus();
  }catch{
    expenseStatus.innerText = "Server could not save expense.";
  }
}

function renderExpenses(expenses, total){
  expenseTotal.innerText = numberText(total);

  if(!expenses.length){
    expenseRows.innerHTML = `<tr><td colspan="3">No expenses yet</td></tr>`;
    return;
  }

  expenseRows.innerHTML = expenses.map(expense=>`
    <tr>
      <td>${escapeHtml(formatExpenseDate(expense.date))}</td>
      <td>${escapeHtml(expense.item)}</td>
      <td>${numberText(expense.amount)}</td>
    </tr>
  `).join("");
}

function formatExpenseDate(value){
  const [year, month, day] = String(value).split("-").map(Number);

  if(!year || !month || !day){
    return value || "";
  }

  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
}

function numberText(value){
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits:0 });
}

function currentTimeText(){
  return new Date().toLocaleTimeString([], { hour:"numeric", minute:"2-digit", second:"2-digit" });
}

function escapeHtml(value){
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

expenseDate.value = todayValue();
expenseFilterDate.value = todayValue();
loadExpenses();
