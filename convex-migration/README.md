# Convex Migration Notes

The React app is designed so Google Sheets can be replaced by Convex with minimal UI changes. Keep UI components dependent on repository methods, not storage-specific APIs.

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
| Master data sheets | Same camelCase table names | Normalize IDs and add uniqueness indexes. |
| `form_templates` | `formTemplates` | Store template config JSON, active fiscal years, Drive file IDs. |
| `bulk_import_templates` | `bulkImportTemplates` | Store workbook sheet/column mappings and extraction rules. |

## Suggested Convex indexes

- `proposals.byFiscalYearProgram`
- `proposals.byProvinceDistrictMunicipality`
- `proposals.byStatusPhase`
- `budgetLines.byProposal`
- `physicalTargets.byProposal`
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
