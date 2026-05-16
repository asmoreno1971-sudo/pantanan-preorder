let salesToken = localStorage.getItem("adminToken") || "";
let salesRefreshTimer = null;
let salesLoading = false;

const salesLoginPanel = document.getElementById("salesLoginPanel");
const salesPanel = document.getElementById("salesPanel");
const salesPassword = document.getElementById("salesPassword");
const salesLoginStatus = document.getElementById("salesLoginStatus");
const salesDate = document.getElementById("salesDate");
const salesDateLabel = document.getElementById("salesDateLabel");
const salesGrandTotal = document.getElementById("salesGrandTotal");
const salesRows = document.getElementById("salesRows");
const salesStatus = document.getElementById("salesStatus");

function todayValue(){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showSales(){
  salesLoginPanel.classList.add("hidden");
  salesPanel.classList.remove("hidden");
  startAutoRefresh();
}

async function loginSales(){
  const res = await fetch("/api/admin/login", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ password:salesPassword.value })
  });
  const data = await res.json();

  if(!data.ok){
    salesLoginStatus.innerText = "Wrong password";
    return;
  }

  salesToken = data.token;
  localStorage.setItem("adminToken", salesToken);
  showSales();
  loadSales();
}

async function loadSales(){
  if(!salesToken || salesLoading){
    return;
  }

  salesLoading = true;
  salesStatus.innerText = "Loading...";

  let data;

  try{
    const res = await fetch(`/api/sales/daily?date=${encodeURIComponent(salesDate.value)}`, {
      headers:{ Authorization:`Bearer ${salesToken}` },
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
    salesLoginPanel.classList.remove("hidden");
    salesPanel.classList.add("hidden");
    salesLoading = false;
    return;
  }

  renderSales(data.report);
  salesStatus.innerText = `Auto updated ${currentTimeText()}`;
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
  }, 5000);
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

salesPassword.addEventListener("keydown", function(event){
  if(event.key === "Enter"){
    loginSales();
  }
});

salesDate.value = todayValue();

if(salesToken){
  showSales();
  loadSales();
}

document.addEventListener("visibilitychange", function(){
  if(document.visibilityState === "visible"){
    keepTodayCurrent();
    loadSales();
  }
});
