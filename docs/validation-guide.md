# Validation Guide

The validation engine is implemented in `app/src/utils/validation.js`.

## Rules

| Rule | Description | Source basis |
|---|---|---|
| Required fields | Fiscal year, title, office, program, PAP, UACS, location, commodity, intervention, beneficiary, budget, tier, source, justification, outputs, outcomes, readiness, and schedule must be complete. | District proposal workbooks and BP Form 202 |
| Duplicate activity | Flags duplicate activity titles in the same municipality, program, and fiscal year. | Consolidation integrity requirement |
| Municipality-district map | Municipality must match the configured congressional district. | District proposal workbooks and map-ready output |
| Tier 2 readiness | Tier 2 proposals require justification and readiness status/documents. | Internal guidelines and BP Form 202 |
| Target without unit | Physical target lines must include unit of measure. | Proposal workbooks and BED 2 |
| Budget without expense class | Budget lines require PS, MOOE, CO, or FinEx. | BED financial capture and BP forms |
| Indicator-unit mismatch | Indicator unit must match master indicator setup. | BED 2 and performance measure integrity |
| Climate rationale | Climate-tagged activities require climate rationale. | NBM climate expenditure reporting |

## Bulk Excel Submission Rules

| Rule | Description | Source basis |
|---|---|---|
| Template profile match | Uploaded workbook must be assigned to a registered bulk import template such as `BULK-COMMODITY`, `BULK-FMR`, or `BULK-BED-CAPTURE`. | District proposal workbooks, FMR sheets, BED capture files |
| Multi-program workbook scope | Regional workbooks such as `BULK-RFO2-SPATIAL` may use `Auto-detect from workbook` for banner program and submitting office when each row contains DA operating unit/agency and commodity/industry fields. | `RFO2_Spatial_Details_of_FY_2027_Budget_FINAL.xlsx` |
| Expected sheet check | Workbook must include at least one expected sheet for the selected template profile. | Commodity banner worksheets and BED capture sheets |
| Required column check | Required columns must be present before row extraction. | `PROGRAM/SUBPROGRAM/ INDICATORS`, `UNIT OF MEASURE`, `FY 2027 PROPOSAL`, municipality remarks, FMR project fields, BED financial/physical fields |
| Master-list matching | Program, PAP, UACS, municipality, district, commodity, indicator, unit, object code, expense class, climate tag, and GEDSI/GAD tag must match configured master data. | Prevents free-text drift from Excel workbooks |
| Row staging | Extracted rows must enter `bulk_submission_rows` first and cannot directly overwrite accepted proposal records. | Data integrity and audit trail |
| Phase append-only | BED/NEP/GAA uploads must append `phase_history` snapshots and never overwrite proposal-stage values. | Phase tracking requirement |
| Exception report | Failed rows must produce a downloadable validation exception report for banner-program correction. | Review workflow |

## Status values

`Draft`, `Needs Correction`, `Validated`, `Approved`.

## Implementation note

Validation results should be stored in `validation_issues` for audit and review tracking, while the latest summary status is reflected on `proposals.validation_status`.

Bulk upload validation should additionally write row-level findings to `bulk_submission_rows.validation_notes` and summary findings to `validation_issues` when an extracted row is accepted as a proposal.
