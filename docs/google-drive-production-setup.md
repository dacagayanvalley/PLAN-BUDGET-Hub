# Google Drive Production Setup

Use this guide when moving PLAN-BUDGET Hub from demo/local mode to production Google Sheets and Drive storage.

## 1. Create the Drive folders

Create one root folder:

`PLAN-BUDGET Hub Repository`

Inside it, create:

- `00 System Config`
- `01 Bulk Submissions`
- `02 Proposal Attachments`
- `03 Generated Reports`
- `04 Templates`
- `99 Archive`

Production folder convention:

- Bulk uploads: `PLAN-BUDGET Hub Repository / 01 Bulk Submissions / FY 2027 / {Program}`
- Proposal files: `PLAN-BUDGET Hub Repository / 02 Proposal Attachments / FY 2027 / {Program} / {proposal_id}`
- Generated reports: `PLAN-BUDGET Hub Repository / 03 Generated Reports / FY 2027 / {Report Type}`
- Config templates: `PLAN-BUDGET Hub Repository / 04 Templates / {Template Code}`

Copy the root folder ID from the Drive URL. It is the long ID after `/folders/`.

## 2. Create the production Google Sheet

Create a Google Sheet named:

`PLAN-BUDGET Hub Database - Production`

Generate blank CSV headers locally:

```powershell
cd "C:\Users\Jeff Factora\Downloads\PLAN-BUDGET Hub\app"
npm run schema:csv
```

Import each CSV in `export-templates/google-sheet-schema` into a tab with the same filename, without `.csv`.

Minimum tabs required before first run:

`proposals`, `budget_lines`, `physical_targets`, `phase_history`, `attachments`, `bulk_submissions`, `bulk_submission_rows`, `validation_issues`, `audit_logs`, `users`, `offices`, `municipalities`, `districts`, `programs`, `paps`, `commodities`, `intervention_types`, `indicators`, `object_codes`, `expense_classes`, `climate_tags`, `gedsi_tags`, `form_templates`, `bulk_import_templates`.

## 3. Load only master data first

Do not load proposal dummy data into production.

Start with these master tables:

- `users`
- `offices`
- `municipalities`
- `districts`
- `programs`
- `paps`
- `commodities`
- `intervention_types`
- `indicators`
- `object_codes`
- `expense_classes`
- `climate_tags`
- `gedsi_tags`
- `form_templates`
- `bulk_import_templates`

You may use the demo CSVs only as examples while preparing master data. Do not import `proposals.csv`, `budget_lines.csv`, `physical_targets.csv`, `phase_history.csv`, or `bulk_submissions.csv` into production unless you intentionally want sample/training records.

## 4. Configure Apps Script

Open the production Google Sheet, then go to `Extensions > Apps Script`.

Set these constants:

```javascript
const SPREADSHEET_ID = 'YOUR_PRODUCTION_SPREADSHEET_ID';
const DRIVE_ROOT_FOLDER_ID = 'YOUR_PLAN_BUDGET_HUB_REPOSITORY_FOLDER_ID';
```

Enable the Advanced Google Service:

1. In Apps Script, open `Services`.
2. Add `Drive API`.
3. In the linked Google Cloud project, ensure the Drive API is enabled.

Drive API is needed if Apps Script will convert uploaded Excel files to Google Sheets for extraction.

## 5. Bulk submission processing flow

The production workflow should be:

1. Program encoder uploads Excel file to `01 Bulk Submissions / FY {year} / {program}`.
2. Apps Script registers a row in `bulk_submissions`.
3. Apps Script converts Excel to Google Sheets and saves `converted_sheet_id`.
4. Apps Script reads configured sheets/columns from `bulk_import_templates`.
5. Raw rows are staged in `bulk_submission_rows`.
6. Validation checks master-data matching and required fields.
7. Reviewer accepts valid rows into `proposals`, `budget_lines`, `physical_targets`, and `phase_history`.
8. Exceptions remain downloadable as a validation exception report.

## 6. Production environment variables

Copy `app/.env.production.example` to `app/.env.production`, then set:

```env
VITE_DATA_MODE=google
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Build production:

```powershell
cd "C:\Users\Jeff Factora\Downloads\PLAN-BUDGET Hub\app"
npm run build:production
```

For local empty setup:

```powershell
npm run dev
```

For training/demo sample records only:

```powershell
npm run dev:demo
```

## 7. Recommended permissions

- System Admin: editor on Sheet, Drive root, and Apps Script.
- PMED/PIPS Reviewer: editor on production Sheet and Drive root.
- Program Encoder: contributor/editor on `01 Bulk Submissions` and assigned program folders.
- Program Reviewer: reviewer/editor on assigned program folders.
- Management Viewer: viewer on Sheet dashboard/report outputs.
- Budget Reviewer: editor on budget, phase, and report tables.
- Read-only Viewer: viewer only.

Use Google Groups where possible.

## 8. Production cutover checklist

- Root Drive folder created.
- Production Google Sheet created from blank headers.
- Master data imported and reviewed.
- No dummy proposal/budget/phase records imported.
- Apps Script constants set.
- Drive API enabled in Apps Script.
- Web app deployed.
- `VITE_APPS_SCRIPT_URL` set in `app/.env.production`.
- `npm run build:production` passes.
- App banner says `Production mode connected to Google Sheets`.
