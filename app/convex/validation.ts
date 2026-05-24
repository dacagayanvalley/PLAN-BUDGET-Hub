import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./authHelpers";

export const listIssues = query({
  args: {
    fiscalYear: v.string(),
    status: v.optional(v.string()),
    issueGroup: v.optional(v.string()),
    resolved: v.optional(v.boolean()),
    sessionToken: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    if (args.issueGroup) {
      return await ctx.db
        .query("validationIssues")
        .withIndex("by_fiscalYear_issueGroup", (q) => q.eq("fiscalYear", args.fiscalYear).eq("issueGroup", args.issueGroup || ""))
        .paginate(args.paginationOpts);
    }
    if (args.resolved !== undefined) {
      return await ctx.db
        .query("validationIssues")
        .withIndex("by_fiscalYear_resolved", (q) => q.eq("fiscalYear", args.fiscalYear).eq("resolved", args.resolved ?? false))
        .paginate(args.paginationOpts);
    }
    if (args.status) {
      return await ctx.db
        .query("validationIssues")
        .withIndex("by_fiscalYear_status", (q) => q.eq("fiscalYear", args.fiscalYear).eq("status", args.status || ""))
        .paginate(args.paginationOpts);
    }
    return await ctx.db
      .query("validationIssues")
      .withIndex("by_fiscalYear_resolved", (q) => q.eq("fiscalYear", args.fiscalYear).eq("resolved", false))
      .paginate(args.paginationOpts);
  },
});

export const summary = query({
  args: { fiscalYear: v.string(), sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    const issues = await ctx.db
      .query("validationIssues")
      .withIndex("by_fiscalYear_resolved", (q) => q.eq("fiscalYear", args.fiscalYear).eq("resolved", false))
      .collect();
    const groups = new Map<string, number>();
    for (const issue of issues) {
      groups.set(issue.issueGroup, (groups.get(issue.issueGroup) || 0) + 1);
    }
    return {
      totalIssues: issues.length,
      byGroup: [...groups.entries()].map(([issueGroup, count]) => ({ issueGroup, count })).sort((a, b) => b.count - a.count),
    };
  },
});
