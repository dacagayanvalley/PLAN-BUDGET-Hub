# PLAN-BUDGET Hub

Working prototype for the Department of Agriculture - Regional Field Office No. 02 planning and budget workflow.

The prototype follows the principle: encode once, validate once, reuse many times. It uses a repository/service layer so the first storage target can be Google Sheets and Google Drive, while the same app contracts can later move to Convex.

## What is included

- React + Vite dashboard prototype in `app/`.
- Production mode uses Google Sheets/Drive; demo seed data is available only when explicitly enabled.
- Repository abstraction with a mock repository and Google Apps Script repository stub.
- Validation engine for required fields, duplicate activity titles, municipality-district mapping, Tier 2 readiness, budget/expense class, indicator-unit mismatch, and climate rationale checks.
- Dashboard, proposal intake, master data, validation, consolidation, phase tracking, reports, MOV repository, and help screens.
- Bulk Excel submission workflow for commodity banner program workbooks, FMR/infrastructure sheets, and BED capture workbooks.
- Source inventory generated from every file under `source-files/` in `docs/source-analysis/source-requirements.md`.
- Google Sheets/Drive setup guide, data dictionary, role matrix, and Convex migration notes.
- Convex backend scaffold in `app/convex/` for the next production database phase.

## Source-file basis

The authoritative source review is documented in `docs/source-analysis/source-requirements.md`.

Key structures extracted:

- District proposal workbooks such as `source-files/sample-excel-files/CAGAYAN PROVINCE/1st District Cagayan 2027 Proposal.xlsx` use banner-program sheets with columns for program/subprogram/indicators, unit of measure, GAA/NEP/proposal values, and municipality remarks.
- FMR/PRDP proposal sheets include municipality, barangay/location, project name, estimated length, and estimated amount.
- BED workbooks such as `source-files/GAA-BED-forms/RICE BED 2.xlsx` and `source-files/GAA-BED-forms/CORN BED 2.xlsx` include financial capture, physical capture, BED 1 obligation, BED 2 physical, BED 3 disbursement, PREXC program/subprogram, activity, province, municipality, district, commodity, climate, GAD/GEDSI-like, PICS, month, quarter, MOOE, CO, and total fields.
- `source-files/NEP-forms/QTR BP FORM 202 signed.pdf` informs Tier 2 profile fields, justification, beneficiaries, implementing unit, objectives, implementation scheme, and readiness attachments such as DED and POW.
- Budget-call and internal-guideline PDFs inform Tier 1/Tier 2 readiness, PIP/RDC/CSO/convergence reporting, climate expenditure reporting, submission requirements, and auditability.

## Local setup

```powershell
cd "C:\Users\Jeff Factora\Downloads\PLAN-BUDGET Hub\app"
npm install
npm run dev
```

Open the dev URL printed by Vite, typically `http://127.0.0.1:5173/`.

## Build

```powershell
cd "C:\Users\Jeff Factora\Downloads\PLAN-BUDGET Hub\app"
npm run build
```

## Storage strategy

The app currently defaults to the mock repository for local development:

- `app/src/services/repository.js`
- `app/src/seed/seedData.js`

For Google Apps Script mode, deploy the Apps Script described in `docs/apps-script-setup.md`, then set:

```powershell
$env:VITE_DATA_MODE="google"
$env:VITE_APPS_SCRIPT_URL="https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
```

Production builds default to Google mode. Demo/sample records are only loaded with `VITE_DATA_MODE=demo` or `npm run dev:demo`.

The UI and validation logic should not talk to Google APIs directly. CRUD, Drive folder creation, file link/upload registration, report generation, and audit logging should flow through the repository/service layer.

### Convex backend phase

The first Convex backend scaffold is available in `app/convex/`. It includes schema, indexes, paginated proposal queries, validation issue queries, dashboard summaries, import mutations, and transactional proposal upsert.

Use this when moving away from loading the whole Google Sheet in the browser:

```powershell
cd "C:\Users\Jeff Factora\Downloads\PLAN-BUDGET Hub\app"
npm run convex:dev
```

After creating a Convex deployment, set:

```powershell
VITE_DATA_MODE=convex
VITE_CONVEX_URL=https://YOUR-CONVEX-DEPLOYMENT.convex.cloud
```

See `convex-migration/README.md` for the migration sequence and table mapping.

## Important folders

- `app/src/services/` - repository abstraction and Google Apps Script client.
- `app/convex/` - Convex schema, queries, mutations, validation rules, and import functions.
- `app/src/utils/validation.js` - validation engine.
- `app/src/seed/` - local sample records.
- `app/scripts/seed-google-sheets.js` - exports optional demo/training CSVs.
- `app/scripts/create-google-sheet-template.js` - exports blank production Google Sheet tab headers.
- `app/scripts/seed-google-sheets.js` - exports seed CSVs, including bulk submission/import template tables.
- `docs/source-analysis/` - extracted source-file inventory.
- `docs/data-dictionary.md` - Google Sheet table design.
- `docs/apps-script-setup.md` - initial Google Sheets/Drive backend guide.
- `docs/google-drive-production-setup.md` - production Drive, Sheet, bulk upload, and env configuration checklist.
- `docs/role-matrix.md` - role permissions.
- `docs/validation-guide.md` - validation rules.
- `convex-migration/README.md` - table-to-Convex mapping.
- `export-templates/` - template registry and sample CSV outputs.

## Prototype limits

This is a working frontend prototype with mock/local data and a Google Apps Script integration contract. The next production step is to create the Google Sheet tabs from `docs/data-dictionary.md`, deploy the Apps Script API, and wire `GoogleSheetsRepository.loadAllAsync()` into app startup.
