import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

loadEnvFile(resolve(process.cwd(), ".env.local"));

const workbookPath = process.argv[2];
if (!workbookPath) {
  console.error("Usage: npm run import:spatial-xlsx -- <path-to-RFO2-spatial-workbook.xlsx>");
  process.exit(1);
}

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("Missing VITE_CONVEX_URL. Run `npx convex dev` first.");
  process.exit(1);
}

const python = process.env.PYTHON || "python";
const extractor = resolve(process.cwd(), "scripts", "extract-spatial-workbook.py");
const extraction = spawnSync(python, [extractor, workbookPath], { encoding: "utf8" });
if (extraction.status !== 0) {
  console.error(extraction.stderr || extraction.stdout);
  process.exit(extraction.status || 1);
}

const extracted = JSON.parse(extraction.stdout);
const client = new ConvexHttpClient(convexUrl);
const login = await client.mutation(anyApi.auth.login, {
  name: process.env.PLAN_BUDGET_ADMIN_USER || "System Admin",
  password: process.env.PLAN_BUDGET_ADMIN_PASSWORD || "PlanBudget2027!",
});
const sessionToken = login.sessionToken;
const masterData = await client.query(anyApi.masterData.listCore, { sessionToken });
const municipalityMap = new Map((masterData.municipalities || []).map((row) => [normalize(row.name), row]));
const programByName = new Map((masterData.programs || []).map((row) => [normalize(row.name), row]));

await client.mutation(anyApi.seed.seedMasterData, {
  users: [],
  municipalities: extracted.municipalities.filter((row) => !municipalityMap.has(normalize(row.name))),
  offices: extracted.offices,
  programs: [],
  mfos: [],
  commodities: extracted.commodities,
  interventionTypes: [],
  indicators: [],
  unitsOfMeasure: [],
  objectCodes: [],
  expenseClasses: [],
  climateTags: [],
  gedsiTags: [],
  sessionToken,
});

const proposals = extracted.entries.map((entry, index) => {
  const program = inferProgram(entry.office, entry.commodity);
  const masterProgram = programByName.get(normalize(program));
  const municipality = municipalityMap.get(normalize(entry.municipality));
  const tier1Amount = Number(entry.tier1Thousands || 0) * 1000;
  const tier2Amount = Number(entry.tier2Thousands || 0) * 1000;
  const budgetAmount = tier1Amount + tier2Amount;
  const proposalId = `PBP-2027-SPATIAL-${String(index + 1).padStart(4, "0")}`;
  const mfo = inferMfo(entry.intervention);
  return {
    proposalId,
    fiscalYear: "2027",
    title: `${entry.intervention} - ${entry.municipality || entry.province}`,
    office: entry.office || "DA RFO2",
    program,
    subprogram: "",
    mfo,
    pap: mfo,
    uacs: masterProgram?.uacs || "",
    province: entry.province || municipality?.province || "",
    municipality: entry.municipality || "",
    district: municipality?.district || "",
    commodity: entry.commodity || "",
    interventionType: entry.intervention,
    beneficiaryGroup: "LGU / DA operating unit identified beneficiaries",
    beneficiaries: 0,
    budgetAmount,
    nepAmount: 0,
    gaaAmount: 0,
    tier: tier2Amount ? "Tier 2" : "Tier 1",
    source: "Bulk Excel submission",
    justification: `Imported from ${entry.sourceLabel} in RFO2 FY 2027 spatial budget forum workbook.`,
    expectedOutput: `${entry.intervention} encoded for planning validation.`,
    expectedOutcome: "Improved targeting of FY 2027 agriculture and fishery investments.",
    readinessStatus: "Concept",
    climateTag: "Not climate tagged",
    climateRationale: "",
    gedsiTag: "Not GEDSI tagged",
    schedule: "FY 2027",
    remarks: `${entry.sheet} row ${entry.row}; Tier 1 Php ${tier1Amount.toLocaleString()}; Tier 2 Php ${tier2Amount.toLocaleString()}.`,
    validationStatus: "Draft",
  };
});

const batchSize = 100;
let inserted = 0;
let updated = 0;
for (let i = 0; i < proposals.length; i += batchSize) {
  const result = await client.mutation(anyApi.imports.importProposalBatchFast, {
    rows: proposals.slice(i, i + batchSize),
    sessionToken,
  });
  inserted += result.inserted || 0;
  updated += result.updated || 0;
}

const destinationDir = resolve(process.cwd(), "..", "source-files", "imported-submissions");
mkdirSync(destinationDir, { recursive: true });
const copiedPath = resolve(destinationDir, basename(workbookPath));
copyFileSync(workbookPath, copiedPath);

const submissionResult = await client.mutation(anyApi.imports.registerBulkSubmission, {
  submissionId: "BULK-RFO2-SPATIAL-2027",
  fiscalYear: "2027",
  sourceFile: copiedPath,
  program: "Multiple",
  office: "Multiple DA Operating Units",
  templateCode: "BULK-RFO2-SPATIAL",
  phase: "Proposal",
  status: "Imported",
  remarks: `Imported ${proposals.length} proposal rows from ${basename(workbookPath)}.`,
  sessionToken,
});

console.log(JSON.stringify({
  workbookCopiedTo: copiedPath,
  extractedRows: extracted.entries.length,
  proposalsInserted: inserted,
  proposalsUpdated: updated,
  submissionResult,
}, null, 2));

function inferProgram(office = "", commodity = "") {
  const value = `${office} ${commodity}`.toLowerCase();
  if (value.includes("fmr")) return "FMRDP";
  if (value.includes("hvcdp") || value.includes("high value")) return "HVCDP";
  if (value.includes("corn")) return "Corn";
  if (value.includes("rice")) return "Rice";
  if (value.includes("livestock") || value.includes("poultry")) return "Livestock";
  if (value.includes("saad")) return "SAAD";
  if (value.includes("organic")) return "Organic Agriculture Program";
  return "DA RFO2";
}

function inferMfo(intervention = "") {
  const value = intervention.toLowerCase();
  if (value.includes("fmr") || value.includes("road")) return "Farm-to-Market Road Network Services";
  if (value.includes("training") || value.includes("extension")) return "Extension Support, Education and Training Services";
  if (value.includes("market")) return "Market Development Services";
  if (value.includes("irrigation")) return "Irrigation Network Services";
  if (value.includes("machinery") || value.includes("equipment") || value.includes("facility")) return "Agricultural and Fishery Machinery, Equipment and Facilities Support Services";
  return "Production Support Services";
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
