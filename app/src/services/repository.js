import { seedData } from "../seed/seedData.js";

export const emptyData = {
  session: {
    user: "Production User",
    role: "Read-only Viewer",
  },
  users: [],
  masterData: {
    provinces: [],
    districts: [],
    municipalities: [],
    offices: [],
    mfos: [],
    programs: [],
    commodities: [],
    interventionTypes: [],
    indicators: [],
    unitsOfMeasure: [],
    objectCodes: [],
    expenseClasses: [],
    climateTags: [],
    gedsiTags: [],
  },
  proposals: [],
  phaseHistory: [],
  attachments: [],
  bulkSubmissions: [],
  bulkSubmissionRows: [],
  bulkTemplates: [],
  templates: [],
};

export function getDataMode() {
  return import.meta.env.VITE_DATA_MODE || (import.meta.env.PROD ? "google" : "empty");
}

export function createRepository(mode = getDataMode()) {
  if (mode === "google") return new GoogleSheetsRepository();
  if (mode === "demo") return new MockRepository();
  return new EmptyRepository();
}

class EmptyRepository {
  loadAll() {
    return structuredClone(emptyData);
  }

  saveProposal(current, proposal) {
    const exists = current.proposals.some((row) => row.id === proposal.id);
    const proposals = exists
      ? current.proposals.map((row) => (row.id === proposal.id ? proposal : row))
      : [...current.proposals, proposal];
    return { ...current, proposals };
  }
}

class MockRepository {
  loadAll() {
    return structuredClone(seedData);
  }

  saveProposal(current, proposal) {
    const exists = current.proposals.some((row) => row.id === proposal.id);
    const proposals = exists
      ? current.proposals.map((row) => (row.id === proposal.id ? proposal : row))
      : [...current.proposals, proposal];
    return { ...current, proposals };
  }
}

export class GoogleSheetsRepository {
  constructor({ endpoint = import.meta.env.VITE_APPS_SCRIPT_URL } = {}) {
    this.endpoint = endpoint;
  }

  async request(action, payload = {}) {
    if (!this.endpoint) {
      throw new Error("VITE_APPS_SCRIPT_URL is required for Google Sheets mode.");
    }
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload }),
    });
    const json = await response.json();
    if (!json.ok) throw new Error(json.error || "Google Apps Script request failed.");
    return json.data;
  }

  loadAll() {
    return structuredClone(emptyData);
  }

  async loadAllAsync() {
    const data = await this.request("loadAll");
    return normalizeGoogleData(data);
  }

  async saveProposalAsync(proposal) {
    return this.request("upsertProposal", proposal);
  }

  saveProposal(current, proposal) {
    const exists = current.proposals.some((row) => row.id === proposal.id);
    const proposals = exists
      ? current.proposals.map((row) => (row.id === proposal.id ? proposal : row))
      : [...current.proposals, proposal];
    return { ...current, proposals };
  }

  async registerBulkSubmissionAsync(submission) {
    return this.request("registerBulkSubmission", submission);
  }
}

export function normalizeGoogleData(data) {
  const merged = { ...structuredClone(emptyData), ...(data || {}) };
  const master = { ...emptyData.masterData, ...(data?.masterData || {}) };
  const indicators = normalizeIndicators(master.indicators);
  return {
    ...merged,
    masterData: {
      ...master,
      provinces: normalizeNames(master.provinces),
      districts: normalizeNames(master.districts),
      offices: normalizeNames(master.offices),
      mfos: normalizeMfos(master.mfos?.length ? master.mfos : uniqueObjects(indicators, "mfo")),
      commodities: normalizeNames(master.commodities),
      interventionTypes: normalizeInterventionTypes(master.interventionTypes),
      unitsOfMeasure: normalizeNames(master.unitsOfMeasure?.length ? master.unitsOfMeasure : uniqueObjects(indicators, "unit")),
      objectCodes: normalizeNames(master.objectCodes),
      expenseClasses: normalizeNames(master.expenseClasses),
      climateTags: normalizeNames(master.climateTags),
      gedsiTags: normalizeNames(master.gedsiTags),
      programs: normalizePrograms(master.programs, master.paps),
      municipalities: normalizeMunicipalities(master.municipalities),
      indicators,
    },
    proposals: normalizeProposals(merged.proposals, merged.budgetLines, merged.physicalTargets),
    bulkTemplates: normalizeBulkTemplates(merged.bulkTemplates),
  };
}

function uniqueObjects(rows = [], field) {
  return [...new Set(rows.map((row) => row?.[field]).filter(Boolean))].map((name) => ({ name }));
}

function normalizeNames(rows = []) {
  return rows.map((row) => (typeof row === "string" ? row : row.name || row.code || row.id)).filter(Boolean);
}

function normalizeMunicipalities(rows = []) {
  return rows.map((row) => {
    if (typeof row === "string") return { name: row, province: "", district: "", psgc: "" };
    return {
      ...row,
      name: row.name || row.municipality || row.municipality_name || row.city_municipality || row.lgu || "",
      province: row.province || row.province_name || row.province_id || "",
      district: row.district || row.congressional_district || row.district_name || row.district_id || "",
      psgc: row.psgc || row.psgc_code || "",
    };
  }).filter((row) => row.name);
}

function normalizeMfos(rows = []) {
  return rows.map((row) => (typeof row === "string" ? { name: row, code: "", parent_mfo: "" } : row));
}

function normalizeInterventionTypes(rows = []) {
  return rows.map((row) => (typeof row === "string" ? { name: row, mfo: "", source_indicator: "" } : row));
}

function normalizeIndicators(rows = []) {
  return rows.map((row) => (typeof row === "string" ? { name: row, unit: "", mfo: "", pi_level: "" } : row));
}

function normalizePrograms(programs = [], paps = []) {
  return programs.map((program) => {
    if (typeof program === "string") return { name: program, paps: [], uacs: "" };
    const linkedPaps = paps.filter((pap) => pap.program_id === program.id || pap.program === program.name).map((pap) => pap.name);
    return {
      ...program,
      paps: Array.isArray(program.paps) ? program.paps : String(program.paps || "").split(";").map((pap) => pap.trim()).filter(Boolean).concat(linkedPaps),
    };
  });
}

function normalizeProposals(proposals = [], budgetLines = [], physicalTargets = []) {
  return proposals.map((proposal) => ({
    ...proposal,
    id: proposal.id,
    fiscalYear: String(proposal.fiscalYear || proposal.fiscal_year || ""),
    title: proposal.title || "",
    office: proposal.office || proposal.office_id || "",
    program: proposal.program || proposal.program_id || "",
    mfo: proposal.mfo || proposal.mfo_id || "",
    pap: proposal.pap || proposal.pap_id || "",
    province: proposal.province || proposal.province_id || "",
    municipality: proposal.municipality || proposal.municipality_id || "",
    district: proposal.district || proposal.district_id || "",
    budgetAmount: Number(proposal.budgetAmount || proposal.budget_amount || 0),
    interventionType: proposal.interventionType || proposal.intervention_type || "",
    beneficiaryGroup: proposal.beneficiaryGroup || proposal.beneficiary_group || "",
    expectedOutput: proposal.expectedOutput || proposal.expected_output || "",
    expectedOutcome: proposal.expectedOutcome || proposal.expected_outcome || "",
    readinessStatus: proposal.readinessStatus || proposal.readiness_status || "",
    climateTag: proposal.climateTag || proposal.climate_tag || "",
    climateRationale: proposal.climateRationale || proposal.climate_rationale || "",
    gedsiTag: proposal.gedsiTag || proposal.gedsi_tag || "",
    nepAmount: Number(proposal.nepAmount || proposal.nep_amount || 0),
    gaaAmount: Number(proposal.gaaAmount || proposal.gaa_amount || 0),
    validationStatus: proposal.validationStatus || proposal.validation_status || "Draft",
    budgetLines: proposal.budgetLines || budgetLines.filter((line) => line.proposal_id === proposal.id || line.proposalId === proposal.id),
    physicalTargets: proposal.physicalTargets || physicalTargets.filter((line) => line.proposal_id === proposal.id || line.proposalId === proposal.id),
  }));
}

function normalizeBulkTemplates(rows = []) {
  return rows.map((row) => ({
    ...row,
    expectedSheets: Array.isArray(row.expectedSheets)
      ? row.expectedSheets
      : String(row.expectedSheets || row.expected_sheets || "").split(";").map((item) => item.trim()).filter(Boolean),
    requiredColumns: Array.isArray(row.requiredColumns)
      ? row.requiredColumns
      : String(row.requiredColumns || row.required_columns || "").split(";").map((item) => item.trim()).filter(Boolean),
    allowsMultiplePrograms: row.allowsMultiplePrograms === true || row.allow_multiple_programs === true || row.allow_multiple_programs === "TRUE",
    allowsMultipleOffices: row.allowsMultipleOffices === true || row.allow_multiple_offices === true || row.allow_multiple_offices === "TRUE",
  }));
}
