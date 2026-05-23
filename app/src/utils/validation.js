const requiredFields = [
  "fiscalYear",
  "title",
  "office",
  "program",
  "pap",
  "uacs",
  "province",
  "municipality",
  "district",
  "commodity",
  "interventionType",
  "beneficiaryGroup",
  "beneficiaries",
  "tier",
  "source",
  "justification",
  "expectedOutput",
  "expectedOutcome",
  "readinessStatus",
  "schedule",
];

export function validateAll(data) {
  return data.proposals.map((proposal) => ({
    proposalId: proposal.id,
    title: proposal.title,
    issues: validateProposal(proposal, data).issues,
  }));
}

export function validateProposal(proposal, data) {
  const issues = [];
  requiredFields.forEach((field) => {
    if (proposal[field] === undefined || proposal[field] === null || proposal[field] === "") {
      issues.push({ code: `missing_${field}`, message: `Missing required field: ${field}.` });
    }
  });

  const duplicate = data.proposals?.find((row) => (
    row.id !== proposal.id &&
    row.fiscalYear === proposal.fiscalYear &&
    normalize(row.title) === normalize(proposal.title) &&
    row.municipality === proposal.municipality &&
    row.program === proposal.program
  ));
  if (duplicate) {
    issues.push({ code: "duplicate_activity", message: "Duplicate activity title in the same municipality, program, and fiscal year." });
  }

  const municipality = data.masterData.municipalities.find((row) => row.name === proposal.municipality);
  if (municipality && municipality.district !== proposal.district) {
    issues.push({ code: "invalid_municipality_district", message: `${proposal.municipality} is mapped to ${municipality.district}, not ${proposal.district}.` });
  }

  if (proposal.tier === "Tier 2" && (!proposal.justification || proposal.readinessStatus === "Concept")) {
    issues.push({ code: "tier2_readiness", message: "Tier 2 proposals require justification and readiness documents/status." });
  }

  proposal.physicalTargets?.forEach((target) => {
    if (target.target && !target.unit) {
      issues.push({ code: `target_unit_${target.id}`, message: `Physical target ${target.indicator} has no unit of measure.` });
    }
    const masterIndicator = data.masterData.indicators.find((indicator) => indicator.name === target.indicator);
    if (masterIndicator && target.unit && masterIndicator.unit !== target.unit) {
      issues.push({ code: `indicator_unit_${target.id}`, message: `${target.indicator} should use ${masterIndicator.unit}, not ${target.unit}.` });
    }
  });

  proposal.budgetLines?.forEach((line) => {
    if (line.amount && !line.expenseClass) {
      issues.push({ code: `budget_expense_${line.id}`, message: `Budget line ${line.objectCode} has no expense class.` });
    }
  });

  if (proposal.climateTag && proposal.climateTag !== "Not climate tagged" && !proposal.climateRationale) {
    issues.push({ code: "climate_rationale", message: "Climate-tagged activities need a climate rationale." });
  }

  return { status: issues.length ? "Needs Correction" : "Validated", issues };
}

export function createBlankProposal(data) {
  const program = data.masterData.programs[0] || { name: "", paps: [], uacs: "" };
  const municipality = data.masterData.municipalities[0] || { name: "", province: "", district: "" };
  const indicator = data.masterData.indicators[0] || { name: "", unit: "" };
  const objectCode = data.masterData.objectCodes[0] || "";
  const now = new Date().toISOString();
  return {
    id: `PBP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    fiscalYear: "2027",
    title: "",
    description: "",
    office: data.masterData.offices[0] || "",
    program: program.name || "",
    subprogram: "",
    pap: program.paps?.[0] || "",
    uacs: program.uacs || "",
    province: municipality.province || "",
    municipality: municipality.name || "",
    district: municipality.district || "",
    commodity: data.masterData.commodities[0] || "",
    interventionType: data.masterData.interventionTypes[0] || "",
    beneficiaryGroup: "",
    beneficiaries: 0,
    budgetAmount: 0,
    nepAmount: 0,
    gaaAmount: 0,
    tier: "Tier 1",
    source: "",
    justification: "",
    expectedOutput: "",
    expectedOutcome: "",
    readinessStatus: "Concept",
    climateTag: data.masterData.climateTags[0] || "",
    climateRationale: "",
    gedsiTag: data.masterData.gedsiTags[0] || "",
    schedule: "",
    remarks: "",
    phase: "Proposal",
    validationStatus: "Draft",
    budgetLines: [{ id: `BL-${Date.now()}`, objectCode, expenseClass: data.masterData.expenseClasses[0] || "", amount: 0 }],
    physicalTargets: [{ id: `PT-${Date.now()}`, indicator: indicator.name || "", target: 0, unit: indicator.unit || "" }],
    created_at: now,
    updated_at: now,
    created_by: data.session.user,
    updated_by: data.session.user,
  };
}

export function findDuplicateBulkSubmission(submission, data) {
  const candidateKey = bulkKey(submission);
  return (data.bulkSubmissions || []).find((row) => bulkKey(row) === candidateKey);
}

function bulkKey(row) {
  return [
    normalize(row.fiscalYear || row.fiscal_year),
    normalize(row.templateCode || row.template_code),
    normalize(extractId(row.convertedSheetId || row.converted_sheet_id) || extractId(row.driveFileUrl || row.drive_file_id) || row.sourceFile || row.source_file),
  ].join("|");
}

function extractId(value) {
  const match = String(value || "").match(/[-\w]{25,}/);
  return match ? match[0] : String(value || "");
}

export function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
