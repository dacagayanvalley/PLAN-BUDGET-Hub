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

function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
