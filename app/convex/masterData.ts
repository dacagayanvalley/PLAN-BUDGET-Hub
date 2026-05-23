import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { QueryCtx, mutation, query } from "./_generated/server";

export const listCore = query({
  args: {},
  handler: async (ctx) => {
    const [
      municipalities,
      interventionTypes,
      offices,
      programs,
      commodities,
      indicators,
      unitsOfMeasure,
      objectCodes,
      expenseClasses,
      climateTags,
      gedsiTags,
      mfos,
    ] = await Promise.all([
      ctx.db.query("municipalities").collect(),
      ctx.db.query("interventionTypes").collect(),
      listMasterNames(ctx, "office"),
      listMasterNames(ctx, "program"),
      listMasterNames(ctx, "commodity"),
      listMasterNames(ctx, "indicator"),
      listMasterNames(ctx, "unit_of_measure"),
      listMasterNames(ctx, "object_code"),
      listMasterNames(ctx, "expense_class"),
      listMasterNames(ctx, "climate_tag"),
      listMasterNames(ctx, "gedsi_tag"),
      listMasterObjects(ctx, "mfo"),
    ]);

    return {
      provinces: [...new Set(municipalities.map((row) => row.province).filter(Boolean))].sort(),
      districts: [...new Set(municipalities.map((row) => row.district).filter(Boolean))].sort(),
      municipalities,
      interventionTypes,
      offices,
      programs: programs.map((name) => ({ name, paps: [], uacs: "" })),
      commodities,
      indicators: indicators.map((name) => ({ name, unit: "", mfo: "", pi_level: "" })),
      unitsOfMeasure,
      objectCodes,
      expenseClasses,
      climateTags,
      gedsiTags,
      mfos,
    };
  },
});

export const listInterventions = query({
  args: {
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (args.search) {
      return await ctx.db
        .query("interventionTypes")
        .withSearchIndex("search_interventions", (q) => q.search("searchText", args.search || ""))
        .paginate(args.paginationOpts);
    }
    return await ctx.db.query("interventionTypes").paginate(args.paginationOpts);
  },
});

export const upsertMunicipality = mutation({
  args: {
    name: v.string(),
    province: v.string(),
    district: v.string(),
    psgc: v.optional(v.string()),
    actor: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("municipalities").withIndex("by_name", (q) => q.eq("name", args.name)).first();
    const row = {
      name: args.name,
      province: args.province,
      district: args.district,
      psgc: args.psgc,
      searchText: [args.name, args.province, args.district, args.psgc].filter(Boolean).join(" "),
      updatedAt: now,
      updatedBy: args.actor,
      createdAt: existing?.createdAt || now,
      createdBy: existing?.createdBy || args.actor,
    };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("municipalities", row);
  },
});

async function listMasterNames(ctx: QueryCtx, type: string) {
  const rows = await listMasterObjects(ctx, type);
  return rows.map((row) => row.name).sort();
}

async function listMasterObjects(ctx: QueryCtx, type: string) {
  return await ctx.db.query("masterItems").withIndex("by_type", (q) => q.eq("type", type)).collect();
}
