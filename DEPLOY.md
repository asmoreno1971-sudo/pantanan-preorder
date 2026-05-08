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
- The app currently stores products and orders in JSON files. For a serious public deployment, move data to a hosted database.
- Use the official Pantanan Facebook Page Messenger link for `PANTANAN_MESSENGER_LINK`.
- Use the official Pantanan WhatsApp Business number for `PANTANAN_WHATSAPP_LINK`.
- Deploy on HTTPS so QR scans and browser features work reliably.

## Render Settings

Use this project as a Render Web Service:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
