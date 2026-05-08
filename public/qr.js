loadQr();

async function loadQr(){
  const orderMenuLink = `${window.location.origin}/`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=14&data=${encodeURIComponent(orderMenuLink)}`;

  orderQr.src = qrUrl;
  orderLink.href = orderMenuLink;
  qrTarget.innerText = orderMenuLink;
}
