import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { editableRoles, requireRole, requireUser } from "./authHelpers";
import { validateProposalInput } from "./validationRules";

const budgetLine = v.object({
  id: v.optional(v.string()),
  objectCode: v.optional(v.string()),
  expenseClass: v.optional(v.string()),
  amount: v.number(),
});

const physicalTarget = v.object({
  id: v.optional(v.string()),
  indicator: v.optional(v.string()),
  target: v.number(),
  unit: v.optional(v.string()),
});

const proposalFields = {
  proposalId: v.string(),
  fiscalYear: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  office: v.optional(v.string()),
  program: v.optional(v.string()),
  subprogram: v.optional(v.string()),
  mfo: v.optional(v.string()),
  pap: v.optional(v.string()),
  uacs: v.optional(v.string()),
  province: v.optional(v.string()),
  municipality: v.optional(v.string()),
  district: v.optional(v.string()),
  commodity: v.optional(v.string()),
  interventionType: v.optional(v.string()),
  beneficiaryGroup: v.optional(v.string()),
  beneficiaries: v.number(),
  budgetAmount: v.number(),
  nepAmount: v.optional(v.number()),
  gaaAmount: v.optional(v.number()),
  tier: v.optional(v.string()),
  source: v.optional(v.string()),
  justification: v.optional(v.string()),
  expectedOutput: v.optional(v.string()),
  expectedOutcome: v.optional(v.string()),
  readinessStatus: v.optional(v.string()),
  climateTag: v.optional(v.string()),
  climateRationale: v.optional(v.string()),
  gedsiTag: v.optional(v.string()),
  schedule: v.optional(v.string()),
  remarks: v.optional(v.string()),
  phase: v.optional(v.string()),
  budgetLines: v.optional(v.array(budgetLine)),
  physicalTargets: v.optional(v.array(physicalTarget)),
};

const phaseOrder = [
  "Proposal",
  "NEP",
  "GAA",
  "Implementation",
  "Monitoring and Evaluation",
];

export const listPage = query({
  args: {
    fiscalYear: v.string(),
    status: v.optional(v.string()),
    edited: v.optional(v.boolean()),
    program: v.optional(v.string()),
    office: v.optional(v.string()),
    province: v.optional(v.string()),
    search: v.optional(v.string()),
    sessionToken: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    if (args.search) {
      return await ctx.db
        .query("proposals")
        .withSearchIndex("search_records", (q) => {
          let search = q.search("searchText", args.search || "").eq("fiscalYear", args.fiscalYear);
          if (args.status) search = search.eq("validationStatus", args.status);
          if (args.program) search = search.eq("program", args.program);
          if (args.office) search = search.eq("office", args.office);
          if (args.province) search = search.eq("province", args.province);
          return search;
        })
        .paginate(args.paginationOpts);
    }

    if (args.status) {
      return await ctx.db
        .query("proposals")
        .withIndex("by_fiscalYear_status", (q) => q.eq("fiscalYear", args.fiscalYear).eq("validationStatus", args.status || ""))
        .paginate(args.paginationOpts);
    }

    if (args.edited !== undefined) {
      return await ctx.db
        .query("proposals")
        .withIndex("by_fiscalYear_edited", (q) => q.eq("fiscalYear", args.fiscalYear).eq("edited", args.edited ?? false))
        .paginate(args.paginationOpts);
    }

    return await ctx.db
      .query("proposals")
      .withIndex("by_fiscalYear", (q) => q.eq("fiscalYear", args.fiscalYear))
      .paginate(args.paginationOpts);
  },
});

export const getByProposalId = query({
  args: { proposalId: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    return await ctx.db.query("proposals").withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId)).first();
  },
});

export const listPhaseHistory = query({
  args: { fiscalYear: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    const proposals = await ctx.db.query("proposals").withIndex("by_fiscalYear", (q) => q.eq("fiscalYear", args.fiscalYear)).collect();
    const proposalIds = new Set(proposals.map((proposal) => proposal.proposalId));
    const rows = await ctx.db.query("phaseHistory").collect();
    return rows.filter((row) => proposalIds.has(row.proposalId)).sort((a, b) => a.proposalId.localeCompare(b.proposalId) || a.phase.localeCompare(b.phase));
  },
});

export const listBulkSubmissions = query({
  args: { fiscalYear: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    return await ctx.db.query("bulkSubmissions").withIndex("by_fiscalYear_status", (q) => q.eq("fiscalYear", args.fiscalYear)).collect();
  },
});

export const listAttachments = query({
  args: { fiscalYear: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    const proposals = await ctx.db.query("proposals").withIndex("by_fiscalYear", (q) => q.eq("fiscalYear", args.fiscalYear)).collect();
    const proposalIds = new Set(proposals.map((proposal) => proposal.proposalId));
    const rows = await ctx.db.query("attachments").collect();
    return rows.filter((row) => proposalIds.has(row.proposalId));
  },
});

export const upsert = mutation({
  args: {
    proposal: v.object(proposalFields),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireRole(ctx, args.sessionToken, editableRoles);
    const actor = session.publicUser.name;
    const now = Date.now();
    const existing = await ctx.db.query("proposals").withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposal.proposalId)).first();
    const issues = await validateProposalInput(ctx, {
      ...args.proposal,
      nepAmount: args.proposal.nepAmount || 0,
      gaaAmount: args.proposal.gaaAmount || 0,
      budgetLines: args.proposal.budgetLines || [],
      physicalTargets: args.proposal.physicalTargets || [],
    });
    const validationStatus = issues.length ? "Needs Correction" : "Validated";
    const normalized = {
      ...args.proposal,
      title: args.proposal.title || buildTitle(args.proposal),
      pap: args.proposal.mfo || args.proposal.pap || "",
      nepAmount: args.proposal.nepAmount || 0,
      gaaAmount: args.proposal.gaaAmount || 0,
      phase: args.proposal.phase || "Proposal",
      validationStatus,
      edited: Boolean(existing),
      searchText: buildSearchText(args.proposal),
      budgetLines: args.proposal.budgetLines || [],
      physicalTargets: args.proposal.physicalTargets || [],
      updatedAt: now,
      updatedBy: actor,
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || actor,
    };

    if (existing) {
      await ctx.db.patch(existing._id, normalized);
    } else {
      await ctx.db.insert("proposals", normalized);
    }

    const currentIssues = await ctx.db.query("validationIssues").withIndex("by_proposal", (q) => q.eq("proposalId", args.proposal.proposalId)).collect();
    await Promise.all(currentIssues.map((issue) => ctx.db.delete(issue._id)));
    await Promise.all(issues.map((issue) => ctx.db.insert("validationIssues", {
      proposalId: args.proposal.proposalId,
      fiscalYear: args.proposal.fiscalYear,
      status: validationStatus,
      issueCode: issue.issueCode,
      issueGroup: issue.issueGroup,
      message: issue.message,
      severity: issue.severity,
      resolved: false,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    })));

    await ctx.db.insert("auditLogs", {
      entityType: "proposal",
      entityId: args.proposal.proposalId,
      action: existing ? "update" : "create",
      actor,
      summary: `${existing ? "Updated" : "Created"} ${args.proposal.proposalId}; validation status ${validationStatus}.`,
      createdAt: now,
    });

    return { proposalId: args.proposal.proposalId, validationStatus, issueCount: issues.length };
  },
});

export const advancePhase = mutation({
  args: {
    proposalId: v.string(),
    toPhase: v.string(),
    remarks: v.optional(v.string()),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireRole(ctx, args.sessionToken, editableRoles);
    const actor = session.publicUser.name;
    const now = Date.now();
    const proposal = await ctx.db.query("proposals").withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId)).first();
    if (!proposal) throw new Error(`Proposal ${args.proposalId} was not found.`);

    const currentPhase = proposal.phase || "Proposal";
    const currentIndex = phaseOrder.indexOf(currentPhase);
    const nextIndex = phaseOrder.indexOf(args.toPhase);
    if (nextIndex < 0) throw new Error(`${args.toPhase} is not a supported phase.`);
    if (currentIndex >= 0 && nextIndex < currentIndex) {
      throw new Error(`Cannot move ${args.proposalId} backward from ${currentPhase} to ${args.toPhase}.`);
    }
    if (!["Validated", "Approved"].includes(proposal.validationStatus)) {
      throw new Error(`${args.proposalId} must be validated before moving to ${args.toPhase}.`);
    }

    await ctx.db.patch(proposal._id, {
      phase: args.toPhase,
      validationStatus: args.toPhase === "Monitoring and Evaluation" ? "Approved" : proposal.validationStatus,
      updatedAt: now,
      updatedBy: actor,
    });

    await ctx.db.insert("phaseHistory", {
      proposalId: proposal.proposalId,
      phase: args.toPhase,
      date: new Date(now).toISOString().slice(0, 10),
      budgetAmount: phaseAmount(proposal, args.toPhase),
      physicalTarget: String(proposal.physicalTargets?.reduce((sum, target) => sum + Number(target.target || 0), 0) || ""),
      editor: actor,
      remarks: args.remarks || `Advanced from ${currentPhase} to ${args.toPhase}.`,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    });

    await ctx.db.insert("auditLogs", {
      entityType: "proposal",
      entityId: args.proposalId,
      action: "advance_phase",
      actor,
      summary: `Advanced ${args.proposalId} from ${currentPhase} to ${args.toPhase}.`,
      createdAt: now,
    });

    return { proposalId: args.proposalId, phase: args.toPhase };
  },
});

function buildTitle(proposal: { interventionType?: string; commodity?: string; municipality?: string }) {
  return [proposal.interventionType, proposal.commodity, proposal.municipality].filter(Boolean).join(" - ") || "Untitled intervention";
}

function buildSearchText(proposal: Record<string, unknown>) {
  return [
    proposal.proposalId,
    proposal.title,
    proposal.office,
    proposal.program,
    proposal.mfo,
    proposal.province,
    proposal.municipality,
    proposal.district,
    proposal.commodity,
    proposal.interventionType,
    proposal.tier,
  ].filter(Boolean).join(" ");
}

function phaseAmount(proposal: { budgetAmount?: number; nepAmount?: number; gaaAmount?: number }, phase: string) {
  if (phase === "NEP") return proposal.nepAmount || proposal.budgetAmount || 0;
  if (phase === "GAA" || phase === "Implementation" || phase === "Monitoring and Evaluation") return proposal.gaaAmount || proposal.nepAmount || proposal.budgetAmount || 0;
  return proposal.budgetAmount || 0;
}
