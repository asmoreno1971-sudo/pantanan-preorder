let transactionRefreshTimer = null;
let transactionLoading = false;
let transactionPeriod = localStorage.getItem("transactionPeriod") || "day";

const transactionDate = document.getElementById("transactionDate");
const transactionRows = document.getElementById("transactionRows");
const transactionStatus = document.getElementById("transactionStatus");
const transactionCount = document.getElementById("transactionCount");
const lineCount = document.getElementById("lineCount");
const transactionTotal = document.getElementById("transactionTotal");
const periodButtons = [...document.querySelectorAll("[data-period]")];

function todayValue(){
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setTransactionPeriod(period){
  transactionPeriod = period;
  localStorage.setItem("transactionPeriod", period);
  updatePeriodButtons();
  loadTransactions();
}

function updatePeriodButtons(){
  periodButtons.forEach(button=>{
    button.classList.toggle("active", button.dataset.period === transactionPeriod);
  });
}

async function loadTransactions(){
  if(transactionLoading){
    return;
  }

  transactionLoading = true;
  transactionStatus.innerText = "Loading...";

  try{
    const params = new URLSearchParams({
      date:transactionDate.value || todayValue(),
      period:transactionPeriod
    });
    const res = await fetch(`/api/transactions?${params.toString()}`, { cache:"no-store" });
    const data = await res.json();

    if(!data.ok){
      transactionStatus.innerText = data.message || "Unable to load transactions";
      transactionLoading = false;
      return;
    }

    renderTransactions(data.report);
    transactionStatus.innerText = `Auto updated ${currentTimeText()}`;
  }catch{
    transactionStatus.innerText = "Offline. Retrying...";
  }finally{
    transactionLoading = false;
  }
}

function renderTransactions(report){
  transactionCount.innerText = numberText(report.transactionCount);
  lineCount.innerText = numberText(report.lineCount);
  transactionTotal.innerText = numberText(report.totalAmount);

  if(!report.rows.length){
    transactionRows.innerHTML = `<tr><td colspan="5">No transactions yet</td></tr>`;
    return;
  }

  transactionRows.innerHTML = report.rows.map((row, index)=>{
    const nextRow = report.rows[index + 1];
    const showTransactionTotal = !nextRow || nextRow.orderId !== row.orderId;

    return `
    <tr>
      <td><span class="transaction-order">#${String(row.orderNumber || 0).padStart(3, "0")}</span>${escapeHtml(formatTimestamp(row.timestamp))}</td>
      <td>${escapeHtml(row.product)}</td>
      <td>${numberText(row.quantity)}</td>
      <td>${numberText(row.amount)}</td>
      <td class="${showTransactionTotal ? "transaction-total-cell" : "transaction-total-empty"}">${showTransactionTotal ? numberText(row.transactionTotal) : ""}</td>
    </tr>
  `;
  }).join("");
}

function startAutoRefresh(){
  if(transactionRefreshTimer){
    return;
  }

  transactionRefreshTimer = setInterval(()=>{
    if(document.visibilityState === "visible"){
      loadTransactions();
    }
  }, 7000);
}

function numberText(value){
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits:0 });
}

function currentTimeText(){
  return new Date().toLocaleTimeString([], { hour:"numeric", minute:"2-digit", second:"2-digit" });
}

function formatTimestamp(value){
  const date = new Date(value);

  if(Number.isNaN(date.getTime())){
    return "--";
  }

  return date.toLocaleString([], {
    month:"short",
    day:"numeric",
    hour:"numeric",
    minute:"2-digit"
  });
}

function escapeHtml(value){
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

transactionDate.value = todayValue();
updatePeriodButtons();
loadTransactions();
startAutoRefresh();

document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState === "visible"){
    loadTransactions();
  }
});
