# Pantanan Preorder Deployment

## Required Environment Variables

Set these on the hosting platform:

```text
NODE_ENV=production
DATABASE_URL=<Render Postgres connection string>
PANTANAN_WHATSAPP_LINK=https://wa.me/639695093050
PANTANAN_MESSENGER_LINK=https://m.me/your-page-username
```

`PORT` is usually provided by the host. Locally it defaults to `3001`.

For production menu/order persistence, use Render Postgres. The included `render.yaml` creates a free Postgres database and passes `DATABASE_URL` to the web service.

When `DATABASE_URL` is present, the app stores Admin products, orders, and transaction ledgers in Postgres. Local JSON files are only a development fallback. In production without `DATABASE_URL`, the app enters read-only safety mode for live business data: menu pages can load, but product saves and order/transaction writes are blocked so temporary storage cannot silently lose records.

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

- Admin product changes and order records must be saved to Postgres. Without `DATABASE_URL`, Render's free web service filesystem can reset on redeploy, restart, or spin-down.
- Customer and Cashier pages read the same Admin product record from the server. The Admin page no longer pushes old browser backups back into the server on page load.
- Transaction history is protected with a high-water mark. In production, the server refuses to create a fresh empty `orders` record if storage is missing, and refuses writes that would drop existing order IDs or shrink transaction history.
- Sales and Transactions use a separate append-only `transaction-ledger` record. Cashier orders append immediately; customer orders append when completed. Use `POST /api/transactions/backfill` after a storage change to copy any surviving completed orders into the ledger.
- In production without `DATABASE_URL`, Admin product saves, order writes, and transaction writes are blocked. This is intentional: it prevents new sales from being accepted into disposable Render storage.
- After attaching Render Postgres, open `/api/storage-status`. It must show `"storagePersistent":true` before real selling.
- Do not set `ADMIN_PRODUCTS_PATH` in production. The server always uses the canonical `admin-products.json` record and treats `menu.json` as a legacy file to remove.
- Use the official Pantanan Facebook Page Messenger link for `PANTANAN_MESSENGER_LINK`.
- Use the official Pantanan WhatsApp Business number for `PANTANAN_WHATSAPP_LINK`.
- Deploy on HTTPS so QR scans and browser features work reliably.

## Render Settings

Use this project as a Render Web Service:

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`
