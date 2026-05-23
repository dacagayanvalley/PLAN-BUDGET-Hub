import { QueryCtx } from "./_generated/server";

export type ProposalInput = {
  proposalId: string;
  fiscalYear: string;
  office?: string;
  program?: string;
  mfo?: string;
  pap?: string;
  uacs?: string;
  province?: string;
  municipality?: string;
  district?: string;
  commodity?: string;
  interventionType?: string;
  beneficiaryGroup?: string;
  beneficiaries: number;
  budgetAmount: number;
  tier?: string;
  source?: string;
  justification?: string;
  expectedOutput?: string;
  expectedOutcome?: string;
  readinessStatus?: string;
  climateTag?: string;
  climateRationale?: string;
  schedule?: string;
  budgetLines?: Array<{ id?: string; objectCode?: string; expenseClass?: string; amount: number }>;
  physicalTargets?: Array<{ id?: string; indicator?: string; target: number; unit?: string }>;
};

export type ValidationIssue = {
  issueCode: string;
  issueGroup: string;
  message: string;
  severity: "warning" | "error";
};

const requiredFields: Array<keyof ProposalInput> = [
  "fiscalYear",
  "office",
  "program",
  "mfo",
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

export async function validateProposalInput(ctx: QueryCtx, proposal: ProposalInput) {
  const issues: ValidationIssue[] = [];
  for (const field of requiredFields) {
    const value = proposal[field];
    if (value === undefined || value === null || value === "" || value === 0) {
      issues.push({
        issueCode: `missing_${String(field)}`,
        issueGroup: "Missing required fields",
        message: `Missing required field: ${String(field)}.`,
        severity: "error",
      });
    }
  }

  const duplicates = await ctx.db
    .query("proposals")
    .withIndex("by_fiscalYear_municipality", (q) => q.eq("fiscalYear", proposal.fiscalYear).eq("municipality", proposal.municipality || ""))
    .collect();
  const duplicate = duplicates.find((row) => (
    row.proposalId !== proposal.proposalId &&
    normalize(row.interventionType) === normalize(proposal.interventionType) &&
    normalize(row.program) === normalize(proposal.program)
  ));
  if (duplicate) {
    issues.push({
      issueCode: "duplicate_activity",
      issueGroup: "Duplicate activity",
      message: "Duplicate intervention in the same municipality, program, and fiscal year.",
      severity: "error",
    });
  }

  const municipality = proposal.municipality
    ? await ctx.db.query("municipalities").withIndex("by_name", (q) => q.eq("name", proposal.municipality || "")).first()
    : null;
  if (municipality?.district && proposal.district && municipality.district !== proposal.district) {
    issues.push({
      issueCode: "invalid_municipality_district",
      issueGroup: "Municipality-district mapping",
      message: `${proposal.municipality} is mapped to ${municipality.district}, not ${proposal.district}.`,
      severity: "error",
    });
  }

  if (proposal.tier === "Tier 2" && (!proposal.justification || proposal.readinessStatus === "Concept")) {
    issues.push({
      issueCode: "tier2_readiness",
      issueGroup: "Tier 2 readiness",
      message: "Tier 2 proposals require justification and readiness documents/status.",
      severity: "error",
    });
  }

  for (const target of proposal.physicalTargets || []) {
    if (target.target && !target.unit) {
      issues.push({
        issueCode: `target_unit_${target.id || target.indicator || "row"}`,
        issueGroup: "Target unit",
        message: `Physical target ${target.indicator || "row"} has no unit of measure.`,
        severity: "error",
      });
    }
  }

  for (const line of proposal.budgetLines || []) {
    if (line.amount && !line.expenseClass) {
      issues.push({
        issueCode: `budget_expense_${line.id || line.objectCode || "row"}`,
        issueGroup: "Budget expense class",
        message: `Budget line ${line.objectCode || "row"} has no expense class.`,
        severity: "error",
      });
    }
  }

  if (proposal.climateTag && proposal.climateTag !== "Not climate tagged" && !proposal.climateRationale) {
    issues.push({
      issueCode: "climate_rationale",
      issueGroup: "Climate rationale",
      message: "Climate-tagged activities need a climate rationale.",
      severity: "warning",
    });
  }

  return issues;
}

export function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
