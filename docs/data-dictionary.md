# PLAN-BUDGET Hub Data Dictionary

All tables include `created_at`, `updated_at`, `created_by`, and `updated_by` unless otherwise stated.

## Core Google Sheet Tables

| Sheet/Table | Purpose | Key fields | Source basis |
|---|---|---|---|
| `proposals` | One row per proposal/activity/project. | `id`, `fiscal_year`, `title`, `description`, `office_id`, `program_id`, `subprogram`, `pap_id`, `uacs`, `province_id`, `municipality_id`, `district_id`, `commodity_id`, `intervention_type_id`, `beneficiary_group`, `beneficiaries`, `tier`, `source`, `justification`, `expected_output`, `expected_outcome`, `readiness_status`, `climate_tag_id`, `climate_rationale`, `gedsi_tag_id`, `schedule`, `remarks`, `validation_status`, `current_phase` | District proposal workbooks; BP Form 202; internal guidelines |
| `budget_lines` | Multiple budget lines per proposal. | `id`, `proposal_id`, `object_code_id`, `expense_class`, `amount`, `phase`, `month`, `quarter`, `fund_source` | BED financial capture sheets; BP forms |
| `physical_targets` | Multiple physical indicators per proposal. | `id`, `proposal_id`, `indicator_id`, `target`, `unit`, `phase`, `month`, `quarter`, `beneficiary_count`, `group_beneficiary_count` | District proposal sheets; BED 2 physical capture |
| `phase_history` | Immutable phase snapshots. | `id`, `proposal_id`, `phase`, `snapshot_date`, `budget_amount`, `physical_target`, `editor`, `remarks`, `source_report` | Proposal, NEP, GAA, BED, implementation and monitoring workflow |
| `attachments` | Google Drive-linked readiness/MOV files. | `id`, `proposal_id`, `drive_file_id`, `drive_url`, `folder_path`, `document_type`, `name`, `phase`, `uploaded_by` | Endorsement PDF; Tier 2 readiness attachments; MOV requirements |
| `bulk_submissions` | One row per uploaded Excel/CSV batch from banner programs. | `id`, `fiscal_year`, `program_id`, `office_id`, `template_code`, `phase`, `source_file`, `drive_file_id`, `converted_sheet_id`, `status`, `submitted_at`, `submitted_by`, `remarks` | Commodity banner workbooks, FMR sheets, BED capture workbooks |
| `bulk_submission_rows` | Extracted row-level staging area before accepted rows become proposals/budget lines/targets. | `id`, `bulk_submission_id`, `source_sheet`, `source_row_number`, `raw_json`, `mapped_proposal_id`, `validation_status`, `validation_notes` | Supports transparent import review and row-level correction |
| `validation_issues` | Current and historical validation findings. | `id`, `proposal_id`, `rule_code`, `severity`, `message`, `status`, `resolved_at`, `resolved_by` | Validation engine |
| `audit_logs` | Append-only user/action logs. | `id`, `actor`, `role`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`, `timestamp` | Governance and audit trail requirement |

## Master Data Tables

| Sheet/Table | Key fields | Notes |
|---|---|---|
| `users` | `id`, `name`, `email`, `role`, `office_id`, `active` | Roles are defined in `docs/role-matrix.md`. |
| `offices` | `id`, `name`, `office_type` | Includes PMED, Budget, banner programs, FMRDP, and management offices. |
| `municipalities` | `id`, `name`, `province_id`, `district_id`, `psgc`, `income_class` | Used to prevent invalid municipality-district mapping. |
| `districts` | `id`, `name`, `province_id` | Supports congressional-district proposal lists. |
| `programs` | `id`, `name`, `prexc_program`, `uacs` | Extracted from banner-program and BED capture structures. |
| `paps` | `id`, `program_id`, `name`, `uacs`, `prexc_subprogram` | Prevents free-text PAP/UACS entry. |
| `commodities` | `id`, `name`, `program_id` | Rice, Corn, HVCDP crops, livestock, FMR, etc. |
| `intervention_types` | `id`, `name`, `program_id` | Production support, extension, infrastructure, machinery, enterprise support. |
| `indicators` | `id`, `name`, `unit`, `program_id`, `indicator_type` | Used for indicator-unit validation. |
| `object_codes` | `id`, `uacs_object_code`, `name`, `expense_class` | Used in budget lines. |
| `expense_classes` | `id`, `name` | PS, MOOE, CO, FinEx. |
| `climate_tags` | `id`, `name`, `requires_rationale` | Supports climate expenditure reporting. |
| `gedsi_tags` | `id`, `name` | Uses GAD/GEDSI source tags and local categories. |
| `form_templates` | `id`, `code`, `name`, `source_file`, `phase`, `output_format`, `config_json`, `active_from_fy`, `active_to_fy` | Avoids hard-coded annual templates. |
| `bulk_import_templates` | `id`, `code`, `name`, `expected_sheets`, `required_columns`, `mapping_json`, `import_mode`, `source_basis`, `allow_multiple_programs`, `allow_multiple_offices`, `program_detection`, `active` | Controls Excel import parsing per annual/banner-program template. |

## Phase Names

Use these fixed values:

`Proposal`, `DA Internal Review`, `DBM Submission`, `NEP`, `GAA`, `BED`, `Implementation`, `Monitoring`, `Reporting`.

## Source Notes

- `source-files/GAA-BED-forms/CORN BED 2.xlsx` and `RICE BED 2.xlsx` require separate financial, physical, obligation, and disbursement captures.
- `source-files/NEP-forms/QTR BP FORM 202 signed.pdf` requires Tier 2 profile data, objectives, implementation scheme, beneficiary, financial requirement, and readiness attachment fields.
- `source-files/sample-excel-files/* District * 2027*.xlsx` require proposal intake compatibility with banner-program indicators, FMR project rows, municipality remarks, and annual phase columns.

## Bulk Excel Import Staging

Bulk submissions should not write directly to final proposal tables. The recommended flow is:

1. Upload Excel workbook to Google Drive.
2. Convert workbook to Google Sheets through Apps Script/Drive.
3. Match the file to `bulk_import_templates`.
4. Extract raw rows into `bulk_submission_rows`.
5. Run validation against master data and template-required columns.
6. Let reviewers accept rows into `proposals`, `budget_lines`, `physical_targets`, `attachments`, and `phase_history`.
7. Log all accepted, rejected, and corrected rows in `audit_logs`.
