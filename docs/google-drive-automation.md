# Google Drive Source Automation

Use this when switching the web app to a new Google Drive and Google Sheet source.

## What the automation does

The setup script:

- Extracts IDs from full Google Sheet or Drive URLs.
- Updates `google-apps-script/Code.gs` with the Sheet ID and root Drive folder ID.
- Creates or updates `app/.env.production` for Google mode.
- Regenerates blank Google Sheet CSV headers.
- Optionally runs the production build.

## One-command setup

From the app folder:

```powershell
cd "C:\Users\Jeff Factora\Downloads\PLAN-BUDGET Hub\app"
npm run setup:google-drive -- `
  -SpreadsheetId "PASTE_GOOGLE_SHEET_URL_OR_ID" `
  -DriveRootFolderId "PASTE_DRIVE_FOLDER_URL_OR_ID" `
  -AppsScriptUrl "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec" `
  -Build
```

If the Apps Script web app is not deployed yet, omit `-AppsScriptUrl` the first time:

```powershell
npm run setup:google-drive -- `
  -SpreadsheetId "PASTE_GOOGLE_SHEET_URL_OR_ID" `
  -DriveRootFolderId "PASTE_DRIVE_FOLDER_URL_OR_ID"
```

Then deploy Apps Script and run the command again with `-AppsScriptUrl`.

## Remaining manual steps

Google still requires a few permission/deployment actions:

1. Create or choose the production Google Sheet and Drive root folder.
2. Open the Google Sheet, go to `Extensions > Apps Script`, and paste `google-apps-script/Code.gs`.
3. Run `setupDatabase` once in Apps Script to create the tabs, headers, and standard Drive folders.
4. Enable the Drive API advanced service if Excel conversion will be used.
5. Deploy Apps Script as a web app and copy the deployment URL.
6. Share the Sheet and Drive folder with the users or Google Groups that need access.

## Build after changes

```powershell
cd "C:\Users\Jeff Factora\Downloads\PLAN-BUDGET Hub\app"
npm run build:production
```

The app will use Google mode when `app/.env.production` contains:

```env
VITE_DATA_MODE=google
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```
