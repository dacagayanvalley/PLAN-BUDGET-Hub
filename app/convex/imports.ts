import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { editableRoles, requireRole } from "./authHelpers";

const proposalImportRow = v.object({
  proposalId: v.string(),
  fiscalYear: v.string(),
  title: v.optional(v.string()),
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
  validationStatus: v.optional(v.string()),
  createdAt: v.optional(v.number()),
  updatedAt: v.optional(v.number()),
  createdBy: v.optional(v.string()),
  updatedBy: v.optional(v.string()),
});

export const importProposalBatch = mutation({
  args: {
    rows: v.array(proposalImportRow),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireRole(ctx, args.sessionToken, editableRoles);
    const actor = session.publicUser.name;
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db.query("proposals").withIndex("by_proposalId", (q) => q.eq("proposalId", row.proposalId)).first();
      const doc = {
        ...row,
        title: row.title || [row.interventionType, row.commodity, row.municipality].filter(Boolean).join(" - ") || "Untitled intervention",
        pap: row.mfo || row.pap || "",
        beneficiaries: row.beneficiaries || 0,
        budgetAmount: row.budgetAmount || 0,
        nepAmount: row.nepAmount || 0,
        gaaAmount: row.gaaAmount || 0,
        phase: "Proposal",
        validationStatus: row.validationStatus || "Draft",
        edited: Boolean(existing) || isEdited(row),
        searchText: [
          row.proposalId,
          row.title,
          row.office,
          row.program,
          row.mfo,
          row.province,
          row.municipality,
          row.district,
          row.commodity,
          row.interventionType,
          row.tier,
        ].filter(Boolean).join(" "),
        budgetLines: [],
        physicalTargets: [],
        createdAt: row.createdAt || existing?.createdAt || now,
        updatedAt: row.updatedAt || now,
        createdBy: row.createdBy || existing?.createdBy || actor,
        updatedBy: row.updatedBy || actor,
      };
      if (existing) {
        await ctx.db.patch(existing._id, doc);
        updated += 1;
      } else {
        await ctx.db.insert("proposals", doc);
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

export const importProposalBatchFast = mutation({
  args: {
    rows: v.array(proposalImportRow),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireRole(ctx, args.sessionToken, editableRoles);
    const actor = session.publicUser.name;
    const now = Date.now();
    const fiscalYears = [...new Set(args.rows.map((row) => row.fiscalYear))];
    const existingRows = [];
    for (const fiscalYear of fiscalYears) {
      existingRows.push(...await ctx.db.query("proposals").withIndex("by_fiscalYear", (q) => q.eq("fiscalYear", fiscalYear)).collect());
    }
    const existingByProposalId = new Map(existingRows.map((row) => [row.proposalId, row]));
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = existingByProposalId.get(row.proposalId);
      const doc = {
        ...row,
        title: row.title || [row.interventionType, row.commodity, row.municipality].filter(Boolean).join(" - ") || "Untitled intervention",
        pap: row.mfo || row.pap || "",
        beneficiaries: row.beneficiaries || 0,
        budgetAmount: row.budgetAmount || 0,
        nepAmount: row.nepAmount || 0,
        gaaAmount: row.gaaAmount || 0,
        phase: "Proposal",
        validationStatus: row.validationStatus || "Draft",
        edited: Boolean(existing) || isEdited(row),
        searchText: [
          row.proposalId,
          row.title,
          row.office,
          row.program,
          row.mfo,
          row.province,
          row.municipality,
          row.district,
          row.commodity,
          row.interventionType,
          row.tier,
        ].filter(Boolean).join(" "),
        budgetLines: [],
        physicalTargets: [],
        createdAt: row.createdAt || existing?.createdAt || now,
        updatedAt: row.updatedAt || now,
        createdBy: row.createdBy || existing?.createdBy || actor,
        updatedBy: actor,
      };
      if (existing) {
        await ctx.db.patch(existing._id, doc);
        updated += 1;
      } else {
        const id = await ctx.db.insert("proposals", doc);
        existingByProposalId.set(row.proposalId, { ...doc, _id: id } as any);
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

export const importMunicipalityBatch = mutation({
  args: {
    rows: v.array(v.object({
      name: v.string(),
      province: v.string(),
      district: v.string(),
      psgc: v.optional(v.string()),
    })),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireRole(ctx, args.sessionToken, editableRoles);
    const actor = session.publicUser.name;
    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const row of args.rows) {
      const existing = await ctx.db.query("municipalities").withIndex("by_name", (q) => q.eq("name", row.name)).first();
      const doc = {
        ...row,
        searchText: [row.name, row.province, row.district, row.psgc].filter(Boolean).join(" "),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        createdBy: existing?.createdBy || actor,
        updatedBy: actor,
      };
      if (existing) {
        await ctx.db.patch(existing._id, doc);
        updated += 1;
      } else {
        await ctx.db.insert("municipalities", doc);
        inserted += 1;
      }
    }
    return { inserted, updated };
  },
});

export const registerBulkSubmission = mutation({
  args: {
    submissionId: v.string(),
    fiscalYear: v.string(),
    sourceFile: v.string(),
    program: v.optional(v.string()),
    office: v.optional(v.string()),
    templateCode: v.optional(v.string()),
    phase: v.optional(v.string()),
    status: v.string(),
    remarks: v.optional(v.string()),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await requireRole(ctx, args.sessionToken, editableRoles);
    const actor = session.publicUser.name;
    const now = Date.now();
    const existing = await ctx.db.query("bulkSubmissions").withIndex("by_submissionId", (q) => q.eq("submissionId", args.submissionId)).first();
    const doc = {
      submissionId: args.submissionId,
      fiscalYear: args.fiscalYear,
      sourceFile: args.sourceFile,
      program: args.program,
      office: args.office,
      templateCode: args.templateCode,
      phase: args.phase,
      status: args.status,
      remarks: args.remarks,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || actor,
      updatedBy: actor,
    };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return { updated: 1, inserted: 0 };
    }
    await ctx.db.insert("bulkSubmissions", doc);
    return { updated: 0, inserted: 1 };
  },
});

function isEdited(row: { createdAt?: number; updatedAt?: number; createdBy?: string; updatedBy?: string }) {
  if (row.createdBy && row.updatedBy && row.createdBy !== row.updatedBy) return true;
  if (!row.createdAt && row.updatedAt) return true;
  return Boolean(row.createdAt && row.updatedAt && row.updatedAt > row.createdAt);
}
