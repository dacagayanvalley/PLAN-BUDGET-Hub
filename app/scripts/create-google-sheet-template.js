import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("../export-templates/google-sheet-schema");
fs.mkdirSync(outDir, { recursive: true });

const schemas = {
  proposals: ["id", "fiscal_year", "title", "description", "office", "program", "subprogram", "pap", "uacs", "province", "municipality", "district", "commodity", "intervention_type", "beneficiary_group", "beneficiaries", "budget_amount", "nep_amount", "gaa_amount", "tier", "source", "justification", "expected_output", "expected_outcome", "readiness_status", "climate_tag", "climate_rationale", "gedsi_tag", "schedule", "remarks", "validation_status", "current_phase", "created_at", "updated_at", "created_by", "updated_by"],
  budget_lines: ["id", "proposal_id", "object_code", "expense_class", "amount", "phase", "month", "quarter", "fund_source", "created_at", "updated_at", "created_by", "updated_by"],
  physical_targets: ["id", "proposal_id", "indicator", "target", "unit", "phase", "month", "quarter", "beneficiary_count", "group_beneficiary_count", "created_at", "updated_at", "created_by", "updated_by"],
  phase_history: ["id", "proposal_id", "phase", "snapshot_date", "budget_amount", "physical_target", "editor", "remarks", "source_report", "created_at", "updated_at", "created_by", "updated_by"],
  attachments: ["id", "proposal_id", "drive_file_id", "drive_url", "folder_path", "document_type", "name", "phase", "uploaded_by", "created_at", "updated_at", "created_by", "updated_by"],
  bulk_submissions: ["id", "fiscal_year", "program", "office", "template_code", "phase", "source_file", "drive_file_id", "converted_sheet_id", "drive_folder_url", "status", "submitted_at", "submitted_by", "remarks", "created_at", "updated_at", "created_by", "updated_by"],
  bulk_submission_rows: ["id", "bulk_submission_id", "source_sheet", "source_row_number", "raw_json", "mapped_proposal_id", "validation_status", "validation_notes", "created_at", "updated_at", "created_by", "updated_by"],
  validation_issues: ["id", "proposal_id", "bulk_submission_id", "bulk_submission_row_id", "rule_code", "severity", "message", "status", "resolved_at", "resolved_by", "created_at", "updated_at", "created_by", "updated_by"],
  audit_logs: ["id", "actor", "role", "action", "entity_type", "entity_id", "before_json", "after_json", "timestamp"],
  users: ["id", "name", "email", "role", "office", "active", "created_at", "updated_at", "created_by", "updated_by"],
  offices: ["id", "name", "office_type", "created_at", "updated_at", "created_by", "updated_by"],
  municipalities: ["id", "name", "province", "district", "psgc", "income_class", "created_at", "updated_at", "created_by", "updated_by"],
  districts: ["id", "name", "province", "created_at", "updated_at", "created_by", "updated_by"],
  programs: ["id", "name", "prexc_program", "uacs", "created_at", "updated_at", "created_by", "updated_by"],
  paps: ["id", "program", "name", "uacs", "prexc_subprogram", "created_at", "updated_at", "created_by", "updated_by"],
  commodities: ["id", "name", "program", "created_at", "updated_at", "created_by", "updated_by"],
  intervention_types: ["id", "name", "program", "created_at", "updated_at", "created_by", "updated_by"],
  indicators: ["id", "name", "unit", "program", "indicator_type", "created_at", "updated_at", "created_by", "updated_by"],
  object_codes: ["id", "uacs_object_code", "name", "expense_class", "created_at", "updated_at", "created_by", "updated_by"],
  expense_classes: ["id", "name", "created_at", "updated_at", "created_by", "updated_by"],
  climate_tags: ["id", "name", "requires_rationale", "created_at", "updated_at", "created_by", "updated_by"],
  gedsi_tags: ["id", "name", "created_at", "updated_at", "created_by", "updated_by"],
  form_templates: ["id", "code", "name", "source_file", "phase", "output_format", "config_json", "active_from_fy", "active_to_fy", "created_at", "updated_at", "created_by", "updated_by"],
  bulk_import_templates: ["id", "code", "name", "description", "expectedSheets", "requiredColumns", "mapping_json", "importMode", "sourceBasis", "active", "created_at", "updated_at", "created_by", "updated_by"],
};

for (const [sheetName, headers] of Object.entries(schemas)) {
  fs.writeFileSync(path.join(outDir, `${sheetName}.csv`), `${headers.join(",")}\n`);
}
