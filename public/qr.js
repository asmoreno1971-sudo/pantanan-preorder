loadQr();

async function loadQr(){
  const res = await fetch("/api/config");
  const config = await res.json();
  const pantananContactLink = config.whatsappLink || config.messengerLink;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=14&data=${encodeURIComponent(pantananContactLink)}`;

  messengerQr.src = qrUrl;
  messengerLink.href = pantananContactLink;
  qrTarget.innerText = pantananContactLink;
}
