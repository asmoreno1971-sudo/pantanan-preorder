let salesRefreshTimer = null;
let salesLoading = false;

const salesPanel = document.getElementById("salesPanel");
const salesDate = document.getElementById("salesDate");
const salesDateLabel = document.getElementById("salesDateLabel");
const salesGrandTotal = document.getElementById("salesGrandTotal");
const salesRows = document.getElementById("salesRows");
const salesStatus = document.getElementById("salesStatus");
const salesBackupPrefix = "dailySalesBackup:";

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
    salesStatus.innerText = "Offline. Retrying...";
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
    salesStatus.innerText = `Auto updated ${currentTimeText()}`;
  }else{
    const backup = readSalesBackup(salesDate.value);
    renderSales(backup || data.report);
    salesStatus.innerText = backup
      ? `Showing browser backup from ${currentTimeText()}`
      : `Auto updated ${currentTimeText()}`;
  }
  salesLoading = false;
}

function startAutoRefresh(){
  if(salesRefreshTimer){
    return;
  }

  salesRefreshTimer = setInterval(function(){
    if(document.visibilityState === "visible"){
      keepTodayCurrent();
      loadSales();
    }
  }, 7000);
}

function keepTodayCurrent(){
  const today = todayValue();

  if(!salesDate.value || salesDate.value > today){
    salesDate.value = today;
  }
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

salesDate.value = todayValue();
showSales();
loadSales();

document.addEventListener("visibilitychange", function(){
  if(document.visibilityState === "visible"){
    keepTodayCurrent();
    loadSales();
  }
});
