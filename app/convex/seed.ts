import { v } from "convex/values";
import { mutation } from "./_generated/server";

const auditActor = "Convex seed";

const userSeed = v.object({
  name: v.string(),
  role: v.string(),
  office: v.optional(v.string()),
  email: v.optional(v.string()),
});

const municipalitySeed = v.object({
  name: v.string(),
  province: v.string(),
  district: v.string(),
  psgc: v.optional(v.string()),
});

const programSeed = v.object({
  name: v.string(),
  uacs: v.optional(v.string()),
  paps: v.optional(v.array(v.string())),
});

const mfoSeed = v.object({
  code: v.optional(v.string()),
  name: v.string(),
  parent_mfo: v.optional(v.string()),
});

const interventionSeed = v.object({
  code: v.optional(v.string()),
  name: v.string(),
  program: v.optional(v.string()),
  mfo: v.optional(v.string()),
  source_indicator: v.optional(v.string()),
  defaultIndicator: v.optional(v.string()),
  defaultUnit: v.optional(v.string()),
  source: v.optional(v.string()),
});

const indicatorSeed = v.object({
  name: v.string(),
  unit: v.optional(v.string()),
  mfo: v.optional(v.string()),
  pi_level: v.optional(v.string()),
});

export const seedMasterData = mutation({
  args: {
    users: v.array(userSeed),
    municipalities: v.array(municipalitySeed),
    offices: v.array(v.string()),
    programs: v.array(programSeed),
    mfos: v.array(mfoSeed),
    commodities: v.array(v.string()),
    interventionTypes: v.array(interventionSeed),
    indicators: v.array(indicatorSeed),
    unitsOfMeasure: v.array(v.string()),
    objectCodes: v.array(v.string()),
    expenseClasses: v.array(v.string()),
    climateTags: v.array(v.string()),
    gedsiTags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const counts: Record<string, number> = {};

    counts.users = await upsertUsers(ctx, args.users, now);
    counts.municipalities = await upsertMunicipalities(ctx, args.municipalities, now);
    counts.offices = await upsertNameList(ctx, "office", args.offices, now);
    counts.programs = await upsertMasterObjects(ctx, "program", args.programs, now);
    counts.mfos = await upsertMasterObjects(ctx, "mfo", args.mfos, now);
    counts.commodities = await upsertNameList(ctx, "commodity", args.commodities, now);
    counts.indicators = await upsertMasterObjects(ctx, "indicator", args.indicators, now);
    counts.unitsOfMeasure = await upsertNameList(ctx, "unit_of_measure", args.unitsOfMeasure, now);
    counts.objectCodes = await upsertNameList(ctx, "object_code", args.objectCodes, now);
    counts.expenseClasses = await upsertNameList(ctx, "expense_class", args.expenseClasses, now);
    counts.climateTags = await upsertNameList(ctx, "climate_tag", args.climateTags, now);
    counts.gedsiTags = await upsertNameList(ctx, "gedsi_tag", args.gedsiTags, now);
    counts.interventionTypes = await upsertInterventionTypes(ctx, args.interventionTypes, now);

    return counts;
  },
});

async function upsertUsers(ctx: any, users: Array<{ name: string; role: string; office?: string; email?: string }>, now: number) {
  let count = 0;
  for (const user of users) {
    const existing = user.email
      ? await ctx.db.query("users").withIndex("by_email", (q: any) => q.eq("email", user.email)).first()
      : null;
    const fallback = existing || await ctx.db.query("users").filter((q: any) => q.eq(q.field("name"), user.name)).first();
    const doc = {
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role),
      office: user.office,
      status: "Active",
      createdAt: fallback?.createdAt || now,
      updatedAt: now,
      createdBy: fallback?.createdBy || auditActor,
      updatedBy: auditActor,
    };
    if (fallback) await ctx.db.patch(fallback._id, doc);
    else await ctx.db.insert("users", doc);
    count += 1;
  }
  return count;
}

async function upsertMunicipalities(ctx: any, rows: Array<{ name: string; province: string; district: string; psgc?: string }>, now: number) {
  let count = 0;
  for (const row of rows) {
    const existing = await ctx.db.query("municipalities").withIndex("by_name", (q: any) => q.eq("name", row.name)).first();
    const doc = {
      name: row.name,
      province: row.province,
      district: row.district,
      psgc: row.psgc,
      searchText: [row.name, row.province, row.district, row.psgc].filter(Boolean).join(" "),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || auditActor,
      updatedBy: auditActor,
    };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("municipalities", doc);
    count += 1;
  }
  return count;
}

async function upsertNameList(ctx: any, type: string, names: string[], now: number) {
  return await upsertMasterObjects(ctx, type, names.map((name) => ({ name })), now);
}

async function upsertMasterObjects(ctx: any, type: string, rows: Array<Record<string, any>>, now: number) {
  let count = 0;
  for (const row of rows) {
    const name = String(row.name || "").trim();
    if (!name) continue;
    const existing = await ctx.db.query("masterItems").withIndex("by_type_name", (q: any) => q.eq("type", type).eq("name", name)).first();
    const metadata = { ...row };
    delete metadata.name;
    delete metadata.code;
    const doc = {
      type,
      code: row.code,
      name,
      parent: row.parent_mfo || row.parent,
      metadata,
      searchText: [type, row.code, name, row.parent_mfo, row.parent, JSON.stringify(metadata)].filter(Boolean).join(" "),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || auditActor,
      updatedBy: auditActor,
    };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("masterItems", doc);
    count += 1;
  }
  return count;
}

async function upsertInterventionTypes(ctx: any, rows: Array<Record<string, any>>, now: number) {
  let count = 0;
  for (const row of rows) {
    const name = String(row.name || "").trim();
    if (!name) continue;
    const existing = await ctx.db.query("interventionTypes").withIndex("by_name", (q: any) => q.eq("name", name)).first();
    const doc = {
      code: row.code,
      name,
      program: row.program,
      mfo: row.mfo,
      defaultIndicator: row.defaultIndicator || row.source_indicator,
      defaultUnit: row.defaultUnit,
      source: row.source,
      searchText: [name, row.program, row.mfo, row.defaultIndicator, row.source_indicator].filter(Boolean).join(" "),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      createdBy: existing?.createdBy || auditActor,
      updatedBy: auditActor,
    };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("interventionTypes", doc);
    count += 1;
  }
  return count;
}

function normalizeRole(role: string) {
  const value = role.toLowerCase();
  if (value.includes("admin") || value.includes("system")) return "Admin";
  if (value.includes("management") || value.includes("viewer")) return "Management";
  if (value.includes("reviewer") || value.includes("pmed") || value.includes("planning")) return "Planning Officer";
  if (value.includes("encoder") || value.includes("program")) return "Program Officer";
  return role;
}
