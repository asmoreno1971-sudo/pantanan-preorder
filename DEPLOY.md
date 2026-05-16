# Pantanan Preorder Deployment

## Required Environment Variables

Set these on the hosting platform:

```text
NODE_ENV=production
ADMIN_PASSWORD=use-a-strong-password
PANTANAN_WHATSAPP_LINK=https://wa.me/639695093050
PANTANAN_MESSENGER_LINK=https://m.me/your-page-username
```

`PORT` is usually provided by the host. Locally it defaults to `3001`.

For production menu/order persistence, attach persistent storage and set:

```text
DATA_DIR=/var/data
```

The app will store Admin product changes in `DATA_DIR/menu.json` and orders in `DATA_DIR/orders.json`. The bundled `menu.json` is only a first-run seed when no saved menu exists yet.

## Local Start

```powershell
npm start
```

Open:

- Customer page: `http://localhost:3001/`
- Kitchen page: `http://localhost:3001/kitchen`
- Admin page: `http://localhost:3001/admin`
- QR page: `http://localhost:3001/qr`

## Production Notes

- Do not use the default admin password online.
- Admin product changes must be saved to persistent storage. On Render, attach a persistent disk mounted at `/var/data` and set `DATA_DIR=/var/data`. Without persistent storage, a redeploy can reset products back to the repository seed file.
- For a higher-volume public deployment, move `menu.json` and `orders.json` to PostgreSQL or another hosted database.
- Use the official Pantanan Facebook Page Messenger link for `PANTANAN_MESSENGER_LINK`.
- Use the official Pantanan WhatsApp Business number for `PANTANAN_WHATSAPP_LINK`.
- Deploy on HTTPS so QR scans and browser features work reliably.

## Render Settings

Use this project as a Render Web Service:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
