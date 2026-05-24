import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { defaultPassword, hashPassword, issueSession, publicUser, requireUser } from "./authHelpers";

export const listLoginUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter((user) => user.status === "Active").map(publicUser);
  },
});

export const viewer = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await requireUser(ctx, args.sessionToken);
    return session.publicUser;
  },
});

export const login = mutation({
  args: {
    name: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const requestedHash = await hashPassword(args.password);
    const user = await ctx.db.query("users").filter((q) => q.eq(q.field("name"), name)).first();
    if (!user || user.status !== "Active") throw new Error("Invalid username or password.");

    const defaultHash = await hashPassword(defaultPassword);
    const storedHash = user.passwordHash || defaultHash;
    if (storedHash !== requestedHash) throw new Error("Invalid username or password.");
    if (!user.passwordHash) {
      await ctx.db.patch(user._id, { passwordHash: defaultHash, updatedAt: Date.now(), updatedBy: "Convex auth" });
    }

    const sessionToken = await issueSession(ctx, user._id);
    return { sessionToken, user: publicUser(user) };
  },
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.query("userSessions").withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken)).first();
    if (session) await ctx.db.delete(session._id);
    return { ok: true };
  },
});
