import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./authHelpers";

export const summary = query({
  args: {
    fiscalYear: v.string(),
    program: v.optional(v.string()),
    province: v.optional(v.string()),
    status: v.optional(v.string()),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    const proposals = await ctx.db.query("proposals").withIndex("by_fiscalYear", (q) => q.eq("fiscalYear", args.fiscalYear)).collect();
    const filtered = proposals.filter((proposal) => (
      (!args.program || proposal.program === args.program) &&
      (!args.province || proposal.province === args.province) &&
      (!args.status || proposal.validationStatus === args.status)
    ));
    const totals = filtered.reduce((acc, proposal) => {
      acc.count += 1;
      acc.proposed += proposal.budgetAmount || 0;
      acc.nep += proposal.nepAmount || 0;
      acc.gaa += proposal.gaaAmount || 0;
      acc.tier1 += proposal.tier === "Tier 1" ? proposal.budgetAmount || 0 : 0;
      acc.tier2 += proposal.tier === "Tier 2" ? proposal.budgetAmount || 0 : 0;
      acc.funded += proposal.validationStatus === "Approved" ? 1 : 0;
      acc.unfunded += proposal.validationStatus !== "Approved" ? 1 : 0;
      return acc;
    }, { count: 0, proposed: 0, nep: 0, gaa: 0, tier1: 0, tier2: 0, funded: 0, unfunded: 0 });

    return {
      totals,
      byProgram: groupBudget(filtered, "program"),
      byProvince: groupBudget(filtered, "province"),
      byMunicipality: groupBudget(filtered, "municipality"),
      byDistrict: groupBudget(filtered, "district"),
      byCommodity: groupBudget(filtered, "commodity"),
      byExpenseClass: groupBudget(filtered.flatMap((proposal) => proposal.budgetLines), "expenseClass"),
      byClimateTag: groupBudget(filtered, "climateTag"),
      byGedsiTag: groupBudget(filtered, "gedsiTag"),
      byStatus: groupBudget(filtered, "validationStatus"),
    };
  },
});

function groupBudget(rows: Array<Record<string, unknown>>, key: string) {
  const map = new Map<string, { label: string; count: number; budget: number }>();
  for (const row of rows) {
    const label = String(row[key] || "Unspecified");
    const budget = Number(row.budgetAmount ?? row.amount ?? 0);
    const current = map.get(label) || { label, count: 0, budget: 0 };
    current.count += 1;
    current.budget += budget;
    map.set(label, current);
  }
  return [...map.values()].sort((a, b) => b.budget - a.budget);
}
