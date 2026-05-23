import fs from "node:fs";
import path from "node:path";
import { seedData } from "../src/seed/seedData.js";

const outDir = path.resolve("../export-templates/seed-csv");
fs.mkdirSync(outDir, { recursive: true });

const tables = {
  users: seedData.users,
  proposals: seedData.proposals.map(({ budgetLines, physicalTargets, ...proposal }) => proposal),
  budget_lines: seedData.proposals.flatMap((proposal) => proposal.budgetLines.map((line) => ({ ...line, proposal_id: proposal.id }))),
  physical_targets: seedData.proposals.flatMap((proposal) => proposal.physicalTargets.map((line) => ({ ...line, proposal_id: proposal.id }))),
  phase_history: seedData.phaseHistory,
  attachments: seedData.attachments,
  bulk_submissions: seedData.bulkSubmissions,
  bulk_import_templates: seedData.bulkTemplates.map((template) => ({
    ...template,
    expectedSheets: template.expectedSheets.join("; "),
    requiredColumns: template.requiredColumns.join("; "),
  })),
  form_templates: seedData.templates,
  municipalities: seedData.masterData.municipalities,
  programs: seedData.masterData.programs.map((program) => ({ name: program.name, uacs: program.uacs, paps: program.paps.join("; ") })),
  indicators: seedData.masterData.indicators,
};

for (const [name, rows] of Object.entries(tables)) {
  fs.writeFileSync(path.join(outDir, `${name}.csv`), toCsv(rows));
}

function toCsv(rows) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
}
