# Google Sheets learner synchronization

1. Open the learner spreadsheet:
   `https://docs.google.com/spreadsheets/d/1MwsZdl1wPMdbYYBjrsGZOj5ECFprf-3hYoAJUmiF5KE/edit?gid=435948871`
2. Open **Extensions > Apps Script**.
3. Replace the editor contents with `student-sheet-sync.gs`.
4. Open **Project Settings > Script Properties** and add:
   - Property: `SYNC_SECRET`
   - Value: a long private random password
5. Select **Deploy > New deployment > Web app**.
6. Set **Execute as** to yourself and **Who has access** to anyone.
7. Copy the web app `/exec` URL.
8. In the Render `bis1` service, add:
   - `STUDENT_SHEET_SYNC_URL` = the web app `/exec` URL
   - `STUDENT_SHEET_SYNC_SECRET` = the same Script Property value
9. Redeploy `bis1`.

The app will then create, update, and delete matching learner rows. Existing rows are
matched by LRN first, with grade/section plus family and first name as a fallback.
