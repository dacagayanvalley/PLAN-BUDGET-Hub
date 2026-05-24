import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { defaultPassword, hashPassword, issueSession, publicUser, requireRole, requireUser } from "./authHelpers";

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

export const changePassword = mutation({
  args: {
    sessionToken: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
    const session = await requireUser(ctx, args.sessionToken);
    const currentHash = await hashPassword(args.currentPassword);
    const storedHash = session.user.passwordHash || await hashPassword(defaultPassword);
    if (currentHash !== storedHash) throw new Error("Current password is incorrect.");

    const now = Date.now();
    await ctx.db.patch(session.user._id, {
      passwordHash: await hashPassword(args.newPassword),
      updatedAt: now,
      updatedBy: session.publicUser.name,
    });

    const sessions = await ctx.db.query("userSessions").withIndex("by_userId", (q) => q.eq("userId", session.user._id)).collect();
    await Promise.all(sessions.filter((row) => row.sessionToken !== args.sessionToken).map((row) => ctx.db.delete(row._id)));
    return { ok: true };
  },
});

export const adminResetPassword = mutation({
  args: {
    sessionToken: v.string(),
    userId: v.id("users"),
    newPassword: v.string(),
    requestId: v.optional(v.id("passwordResetRequests")),
  },
  handler: async (ctx, args) => {
    if (args.newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
    const admin = await requireRole(ctx, args.sessionToken, ["Admin"]);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User was not found.");
    const now = Date.now();
    await ctx.db.patch(user._id, {
      passwordHash: await hashPassword(args.newPassword),
      updatedAt: now,
      updatedBy: admin.publicUser.name,
    });
    const sessions = await ctx.db.query("userSessions").withIndex("by_userId", (q) => q.eq("userId", user._id)).collect();
    await Promise.all(sessions.map((row) => ctx.db.delete(row._id)));
    if (args.requestId) {
      await ctx.db.patch(args.requestId, {
        status: "Resolved",
        resolvedAt: now,
        resolvedBy: admin.publicUser.name,
      });
    }
    return { ok: true, user: publicUser(user) };
  },
});

export const requestPasswordReset = mutation({
  args: {
    name: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Select your user account before requesting a password reset.");
    const user = await ctx.db.query("users").filter((q) => q.eq(q.field("name"), name)).first();
    if (!user || user.status !== "Active") throw new Error("No active account matched that name.");
    const existing = await ctx.db.query("passwordResetRequests").withIndex("by_status", (q) => q.eq("status", "Open")).collect();
    const duplicate = existing.find((request) => request.userId === user._id);
    if (duplicate) return { ok: true, requestId: duplicate._id, status: "Open" };
    const requestId = await ctx.db.insert("passwordResetRequests", {
      userId: user._id,
      name: user.name,
      office: user.office,
      status: "Open",
      note: args.note,
      requestedAt: Date.now(),
    });
    return { ok: true, requestId, status: "Open" };
  },
});

export const listPasswordResetRequests = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, ["Admin"]);
    const rows = await ctx.db.query("passwordResetRequests").collect();
    return rows.sort((a, b) => b.requestedAt - a.requestedAt);
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
