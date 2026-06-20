let salesRefreshTimer = null;
let salesLoading = false;

const salesPanel = document.getElementById("salesPanel");
const salesDate = document.getElementById("salesDate");
const salesDateLabel = document.getElementById("salesDateLabel");
const salesGrandTotal = document.getElementById("salesGrandTotal");
const salesRows = document.getElementById("salesRows");
const salesStatus = document.getElementById("salesStatus");
const profitPeriodLabel = document.getElementById("profitPeriodLabel");
const profitSales = document.getElementById("profitSales");
const profitExpenses = document.getElementById("profitExpenses");
const profitNet = document.getElementById("profitNet");
const profitStatus = document.getElementById("profitStatus");
const profitExpenseRows = document.getElementById("profitExpenseRows");
const salesBackupPrefix = "dailySalesBackup:";
let profitPeriod = "day";
const salesRefreshIntervalMs = 60000;

function todayValue(){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showSales(){
  salesPanel.classList.remove("hidden");
  startAutoRefresh();
}

async function loadSales(){
  if(salesLoading){
    return;
  }

  salesLoading = true;
  salesStatus.innerText = "Loading...";

  let data;

  try{
    const res = await fetch(`/api/sales/daily?date=${encodeURIComponent(salesDate.value)}`, {
      cache:"no-store"
    });
    data = await res.json();
  }catch{
    const backup = readSalesBackup(salesDate.value);
    if(backup){
      renderSales(backup);
      salesStatus.innerText = "Offline. Showing browser backup.";
    }else{
      salesStatus.innerText = "Offline. Retrying...";
    }
    salesLoading = false;
    return;
  }

  if(!data.ok){
    salesStatus.innerText = data.message || "Unable to load sales";
    salesLoading = false;
    return;
  }

  if(data.report && data.report.rows && data.report.rows.length){
    saveSalesBackup(data.report);
    renderSales(data.report);
    salesStatus.innerText = "";
  }else{
    renderSales(data.report);
    salesStatus.innerText = "";
  }
  loadProfit();
  salesLoading = false;
}

function startAutoRefresh(){
  if(salesRefreshTimer){
    return;
  }

  salesRefreshTimer = setInterval(function(){
    if(document.visibilityState === "visible"){
      if(isEditingProfitExpense()){
        return;
      }

      keepTodayCurrent();
      loadSales();
    }
  }, salesRefreshIntervalMs);
}

function keepTodayCurrent(){
  const today = todayValue();

  if(!salesDate.value || salesDate.value > today){
    salesDate.value = today;
  }
}

function isEditingProfitExpense(){
  return Boolean(document.activeElement && document.activeElement.closest(".profit-expense-sheet"));
}

function renderSales(report){
  salesDateLabel.innerText = formatReportDate(report.date);
  salesGrandTotal.innerText = numberText(report.totalSales);

  if(!report.rows.length){
    salesRows.innerHTML = `<tr><td colspan="3">No sales yet</td></tr>`;
    return;
  }

  salesRows.innerHTML = report.rows.map(row=>`
    <tr>
      <td><span class="sales-time">${escapeHtml(formatSaleTime(row.soldAt))}</span>${escapeHtml(row.name)}</td>
      <td>${numberText(row.frequency)}</td>
      <td>${numberText(row.total)}</td>
    </tr>
  `).join("");
}

function setProfitPeriod(period){
  profitPeriod = ["day", "week", "month", "all"].includes(period) ? period : "day";
  updateProfitTabs();
  loadProfit();
}

async function loadProfit(){
  profitStatus.innerText = "Loading...";

  try{
    const res = await fetch(`/api/sales/profit?date=${encodeURIComponent(salesDate.value)}&period=${encodeURIComponent(profitPeriod)}`, {
      cache:"no-store"
    });
    const data = await res.json();

    if(!data.ok){
      profitStatus.innerText = data.message || "Unable to load profit";
      return;
    }

    renderProfit(data.report);
    profitStatus.innerText = "";
  }catch{
    profitStatus.innerText = "Offline. Retrying...";
  }
}

function renderProfit(report){
  profitPeriodLabel.innerText = profitLabel(report.date, report.period);
  profitSales.innerText = numberText(report.salesTotal);
  profitExpenses.innerText = numberText(report.expenseTotal);
  profitNet.innerText = numberText(report.netProfit);
  document.querySelector(".profit-net").classList.toggle("is-negative", Number(report.netProfit) < 0);
  renderProfitExpenses(report.expenseRows || []);
}

function renderProfitExpenses(expenses){
  if(!expenses.length){
    profitExpenseRows.innerHTML = `<tr><td colspan="3">No expenses yet</td></tr>`;
    return;
  }

  profitExpenseRows.innerHTML = expenses.map(expense=>`
    <tr data-expense-id="${escapeHtml(expense.id)}">
      <td><input class="profit-expense-date" type="date" value="${escapeHtml(expense.date)}"></td>
      <td><input class="profit-expense-item" type="text" value="${escapeHtml(expense.item)}"></td>
      <td>
        <div class="profit-expense-amount-cell">
          <input class="profit-expense-amount" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(expense.amount)}">
          <button type="button" onclick="saveProfitExpense('${escapeJs(expense.id)}')">Save</button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function saveProfitExpense(id){
  const row = [...document.querySelectorAll("[data-expense-id]")]
    .find(item=>item.dataset.expenseId === id);

  if(!row){
    return;
  }

  const body = {
    date:row.querySelector(".profit-expense-date").value,
    item:row.querySelector(".profit-expense-item").value.trim(),
    amount:Number(row.querySelector(".profit-expense-amount").value) || 0
  };

  profitStatus.innerText = "Saving...";

  try{
    const res = await fetch(`/api/expenses/${encodeURIComponent(id)}`, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(body)
    });
    const data = await res.json();

    if(!data.ok){
      profitStatus.innerText = data.message || "Unable to save expense";
      return;
    }

    profitStatus.innerText = "";
    loadProfit();
  }catch{
    profitStatus.innerText = "Server could not save expense.";
  }
}

function updateProfitTabs(){
  document.querySelectorAll("[data-profit-period]").forEach(button=>{
    button.classList.toggle("active", button.dataset.profitPeriod === profitPeriod);
  });
}

function profitLabel(date, period){
  if(period === "all"){
    return "All records";
  }

  const [year, month, day] = String(date).split("-").map(Number);
  const base = new Date(year, month - 1, day);

  if(period === "week"){
    const start = new Date(base);
    const offset = start.getDay() === 0 ? -6 : 1 - start.getDay();
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${shortDate(start)} - ${shortDate(end)}`;
  }

  if(period === "month"){
    return base.toLocaleDateString("en-US", { month:"long", year:"numeric" });
  }

  return formatReportDate(date);
}

function shortDate(date){
  return date.toLocaleDateString("en-US", { month:"short", day:"numeric" });
}

function saveSalesBackup(report){
  try{
    localStorage.setItem(`${salesBackupPrefix}${report.date}`, JSON.stringify({
      savedAt:Date.now(),
      report
    }));
  }catch{
    // Browser storage can fill up; sales display should keep working.
  }
}

function readSalesBackup(date){
  try{
    const stored = JSON.parse(localStorage.getItem(`${salesBackupPrefix}${date}`) || "null");

    if(!stored || !stored.report || !Array.isArray(stored.report.rows) || !stored.report.rows.length){
      return null;
    }

    return stored.report;
  }catch{
    return null;
  }
}

function formatReportDate(value){
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" });
}

function numberText(value){
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits:0 });
}

function currentTimeText(){
  return new Date().toLocaleTimeString([], { hour:"numeric", minute:"2-digit", second:"2-digit" });
}

function formatSaleTime(value){
  const date = new Date(value);

  if(Number.isNaN(date.getTime())){
    return "--:--";
  }

  return date.toLocaleTimeString([], { hour:"numeric", minute:"2-digit" });
}

function escapeHtml(value){
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(value){
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

salesDate.value = todayValue();
updateProfitTabs();
showSales();
loadSales();

document.addEventListener("visibilitychange", function(){
  if(document.visibilityState === "visible"){
    keepTodayCurrent();
    loadSales();
    loadProfit();
  }
});
