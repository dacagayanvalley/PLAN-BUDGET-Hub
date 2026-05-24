import { seedData } from "../seed/seedData.js";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

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
  return import.meta.env.VITE_DATA_MODE || (import.meta.env.PROD ? "convex" : "empty");
}

export function createRepository(mode = getDataMode()) {
  if (mode === "convex") return new ConvexRepository();
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

export class ConvexRepository {
  constructor({ url = import.meta.env.VITE_CONVEX_URL } = {}) {
    this.url = url;
    this.client = url ? new ConvexHttpClient(url) : null;
  }

  assertClient() {
    if (!this.client) {
      throw new Error("VITE_CONVEX_URL is required for Convex mode.");
    }
    return this.client;
  }

  loadAll() {
    return structuredClone(emptyData);
  }

  async loadAllAsync({ fiscalYear = "2027" } = {}) {
    const client = this.assertClient();
    const [masterData, proposals, phaseHistory, bulkSubmissions, attachments] = await Promise.all([
      client.query(anyApi.masterData.listCore, {}),
      this.loadAllProposals(fiscalYear),
      client.query(anyApi.proposals.listPhaseHistory, { fiscalYear }),
      client.query(anyApi.proposals.listBulkSubmissions, { fiscalYear }),
      client.query(anyApi.proposals.listAttachments, { fiscalYear }),
    ]);
    return {
      ...structuredClone(emptyData),
      session: {
        user: import.meta.env.VITE_CURRENT_USER || "Planning Officer",
        role: import.meta.env.VITE_CURRENT_ROLE || "Planning Officer",
      },
      users: masterData.users?.length ? masterData.users : [
        { name: "System Administrator", role: "Admin", office: "Planning, Monitoring and Evaluation Division" },
        { name: "Planning Officer", role: "Planning Officer", office: "Planning, Monitoring and Evaluation Division" },
        { name: "Program Officer", role: "Program Officer", office: "Banner Program" },
        { name: "Management", role: "Management", office: "Regional Management" },
      ],
      masterData: normalizeConvexMasterData(masterData),
      proposals: proposals.map(fromConvexProposal),
      phaseHistory: (phaseHistory || []).map(fromConvexPhaseHistory),
      bulkSubmissions: (bulkSubmissions || []).map(fromConvexBulkSubmission),
      attachments: (attachments || []).map(fromConvexAttachment),
      templates: [
        { code: "PBP", name: "Plan and Budget Proposal Register", phase: "Proposal", outputFormat: "CSV/XLSX" },
        { code: "NEP", name: "National Expenditure Program Matrix", phase: "NEP", outputFormat: "CSV/XLSX" },
        { code: "GAA", name: "General Appropriations Act Matrix", phase: "GAA", outputFormat: "CSV/XLSX" },
        { code: "MNE", name: "Monitoring and Evaluation Report", phase: "Monitoring and Evaluation", outputFormat: "CSV/XLSX" },
      ],
    };
  }

  async loadAllProposals(fiscalYear) {
    const client = this.assertClient();
    const rows = [];
    let cursor = null;
    for (let page = 0; page < 25; page += 1) {
      const result = await client.query(anyApi.proposals.listPage, {
        fiscalYear,
        paginationOpts: { numItems: 500, cursor },
      });
      rows.push(...(result?.page || []));
      if (result?.isDone) break;
      cursor = result?.continueCursor || null;
      if (!cursor) break;
    }
    return rows;
  }

  async saveProposalAsync(proposal, actor = "Planning Officer") {
    const payload = toConvexProposal(proposal);
    return this.assertClient().mutation(anyApi.proposals.upsert, { proposal: payload, actor });
  }

  async advancePhaseAsync({ proposalId, toPhase, remarks, actor }) {
    return this.assertClient().mutation(anyApi.proposals.advancePhase, { proposalId, toPhase, remarks, actor });
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

function normalizeConvexMasterData(masterData = {}) {
  const master = { ...emptyData.masterData, ...masterData };
  return {
    ...master,
    provinces: normalizeNames(master.provinces),
    districts: normalizeNames(master.districts),
    offices: normalizeNames(master.offices),
    mfos: normalizeMfos(master.mfos),
    programs: normalizePrograms(master.programs, []),
    commodities: normalizeNames(master.commodities),
    interventionTypes: normalizeInterventionTypes(master.interventionTypes),
    indicators: normalizeIndicators(master.indicators),
    unitsOfMeasure: normalizeNames(master.unitsOfMeasure),
    objectCodes: normalizeNames(master.objectCodes),
    expenseClasses: normalizeNames(master.expenseClasses),
    climateTags: normalizeNames(master.climateTags),
    gedsiTags: normalizeNames(master.gedsiTags),
    municipalities: normalizeMunicipalities(master.municipalities),
  };
}

function fromConvexProposal(row) {
  return {
    ...row,
    id: row.proposalId,
    created_at: row.createdAt ? new Date(row.createdAt).toISOString() : "",
    updated_at: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
    created_by: row.createdBy || "",
    updated_by: row.updatedBy || "",
  };
}

function toConvexProposal(proposal) {
  return {
    proposalId: proposal.id || proposal.proposalId,
    fiscalYear: String(proposal.fiscalYear || ""),
    title: proposal.title || "",
    description: proposal.description || "",
    office: proposal.office || "",
    program: proposal.program || "",
    subprogram: proposal.subprogram || "",
    mfo: proposal.mfo || "",
    pap: proposal.pap || proposal.mfo || "",
    uacs: proposal.uacs || "",
    province: proposal.province || "",
    municipality: proposal.municipality || "",
    district: proposal.district || "",
    commodity: proposal.commodity || "",
    interventionType: proposal.interventionType || "",
    beneficiaryGroup: proposal.beneficiaryGroup || "",
    beneficiaries: Number(proposal.beneficiaries || 0),
    budgetAmount: Number(proposal.budgetAmount || 0),
    nepAmount: Number(proposal.nepAmount || 0),
    gaaAmount: Number(proposal.gaaAmount || 0),
    tier: proposal.tier || "",
    source: proposal.source || "",
    justification: proposal.justification || "",
    expectedOutput: proposal.expectedOutput || "",
    expectedOutcome: proposal.expectedOutcome || "",
    readinessStatus: proposal.readinessStatus || "",
    climateTag: proposal.climateTag || "",
    climateRationale: proposal.climateRationale || "",
    gedsiTag: proposal.gedsiTag || "",
    schedule: proposal.schedule || "",
    remarks: proposal.remarks || "",
    phase: proposal.phase || "Proposal",
    budgetLines: proposal.budgetLines || [],
    physicalTargets: proposal.physicalTargets || [],
  };
}

function fromConvexPhaseHistory(row) {
  return {
    ...row,
    id: row._id,
    date: row.date || (row.createdAt ? new Date(row.createdAt).toISOString().slice(0, 10) : ""),
  };
}

function fromConvexBulkSubmission(row) {
  return {
    ...row,
    id: row.submissionId,
    submitted_by: row.createdBy || "",
  };
}

function fromConvexAttachment(row) {
  return {
    ...row,
    id: row._id,
    uploaded_by: row.uploadedBy || row.createdBy || "",
  };
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
