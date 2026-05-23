# Convex Migration Notes

The React app is designed so Google Sheets can be replaced by Convex with minimal UI changes. Keep UI components dependent on repository methods, not storage-specific APIs.

## Current migration status

The first Convex backend scaffold now lives in `app/convex/`.

Implemented backend files:

- `schema.ts` - Convex tables, indexes, and search indexes for proposals, validation issues, master data, attachments, bulk submissions, phase history, and audit logs.
- `proposals.ts` - paginated/searchable proposal queries and transactional proposal upsert with validation issue regeneration.
- `validation.ts` - paginated validation issue queries and issue summary.
- `dashboard.ts` - fiscal-year dashboard summaries and grouped budget outputs.
- `masterData.ts` - core master-data query and municipality upsert.
- `imports.ts` - batch import mutations for proposals and municipalities from the Google Sheets/CSV migration path.
- `validationRules.ts` - Convex-side validation rules matching the browser and Google Apps Script workflow.

The Google Sheets backend remains intact. Switch to Convex only after creating a Convex deployment, importing data, and wiring the React repository to generated Convex APIs.

## Setup commands

From `app/`:

```powershell
npm install
npm run convex:dev
```

During first run, Convex will ask you to create or select a deployment and will generate `convex/_generated/`. Keep that generated folder in the app workspace for local development.

For production, set:

```powershell
VITE_DATA_MODE=convex
VITE_CONVEX_URL=https://YOUR-CONVEX-DEPLOYMENT.convex.cloud
```

Then deploy Convex functions:

```powershell
npm run convex:deploy
```

## Table mapping

| Google Sheet | Convex table | Notes |
|---|---|---|
| `proposals` | `proposals` | Use Convex IDs plus stable `proposalCode` for office-facing IDs like `PBP-2027-0001`. |
| `budget_lines` | `budgetLines` | Store `proposalId` as Convex ID reference. |
| `physical_targets` | `physicalTargets` | Store indicator refs and phase/month dimensions. |
| `phase_history` | `phaseHistory` | Append-only table. Do not update phase snapshots in place. |
| `attachments` | `attachments` | Store Drive URL initially; later use Convex file storage or external Drive metadata. |
| `bulk_submissions` | `bulkSubmissions` | Tracks uploaded Excel/CSV batch files and review status. |
| `bulk_submission_rows` | `bulkSubmissionRows` | Staging table for extracted raw rows before accepted proposal writes. |
| `validation_issues` | `validationIssues` | Store active/resolved state and rule metadata. |
| `audit_logs` | `auditLogs` | Append-only; consider retention rules. |
| `mfos` | `mfos` | OPIF Major Final Outputs and service groupings; add unique indexes on `code` and `name`. |
| `units_of_measure` | `unitsOfMeasure` | Controlled units from OPIF definitions; keep as reference data for physical targets and indicators. |
| Master data sheets | Same camelCase table names | Normalize IDs and add uniqueness indexes. |
| `form_templates` | `formTemplates` | Store template config JSON, active fiscal years, Drive file IDs. |
| `bulk_import_templates` | `bulkImportTemplates` | Store workbook sheet/column mappings and extraction rules. |

## Suggested Convex indexes

- `proposals.byFiscalYearProgram`
- `proposals.byMfo`
- `proposals.byProvinceDistrictMunicipality`
- `proposals.byStatusPhase`
- `budgetLines.byProposal`
- `physicalTargets.byProposal`
- `indicators.byMfoLevel`
- `phaseHistory.byProposalPhase`
- `attachments.byProposal`
- `bulkSubmissions.byFiscalYearProgram`
- `bulkSubmissionRows.bySubmission`
- `validationIssues.byProposalStatus`
- `auditLogs.byEntity`

## Repository migration

Create a `ConvexRepository` implementing the same surface as `MockRepository` and `GoogleSheetsRepository`.

Required operations:

- `loadAll`
- `saveProposal`
- `listMasterData`
- `createProposalFolder` or equivalent attachment repository action
- `appendAuditLog`
- `generateReport`

Keep validation in shared TypeScript/JavaScript where possible so both Google Sheets and Convex writes use the same rules.
