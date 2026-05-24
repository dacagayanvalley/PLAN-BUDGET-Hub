import type { QueryCtx, MutationCtx } from "./_generated/server";

export const defaultPassword = "PlanBudget2027!";
export const editableRoles = ["Admin", "Planning Officer"];
const sessionTtlMs = 1000 * 60 * 60 * 12;

export function normalizeRole(role: string) {
  const value = String(role || "").toLowerCase();
  if (value.includes("admin") || value.includes("system")) return "Admin";
  if (value.includes("planning") || value.includes("pmed") || value.includes("pips") || value.includes("budget") || value.includes("reviewer")) return "Planning Officer";
  if (value.includes("program") || value.includes("encoder")) return "Program Officer";
  if (value.includes("management") || value.includes("viewer")) return "Management";
  return "Read-only Viewer";
}

export function publicUser(user: any) {
  if (!user) return null;
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    office: user.office,
    status: user.status,
  };
}

export async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(`plan-budget-hub:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function issueSession(ctx: MutationCtx, userId: any) {
  const now = Date.now();
  const sessionToken = `${now}.${crypto.randomUUID()}.${crypto.randomUUID()}`;
  await ctx.db.insert("userSessions", {
    sessionToken,
    userId,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: now + sessionTtlMs,
  });
  return sessionToken;
}

export async function requireUser(ctx: QueryCtx | MutationCtx, sessionToken: string) {
  if (!sessionToken) throw new Error("Please sign in before accessing PLAN-BUDGET Hub.");
  const session = await ctx.db.query("userSessions").withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken)).first();
  if (!session || session.expiresAt < Date.now()) throw new Error("Your session expired. Please sign in again.");
  const user = await ctx.db.get(session.userId);
  if (!user || user.status !== "Active") throw new Error("Your account is inactive or no longer exists.");
  return { user, publicUser: publicUser(user), role: normalizeRole(user.role) };
}

export async function requireRole(ctx: QueryCtx | MutationCtx, sessionToken: string, allowedRoles: string[]) {
  const session = await requireUser(ctx, sessionToken);
  if (!allowedRoles.includes(session.role)) {
    throw new Error(`${session.role} does not have permission for this action.`);
  }
  return session;
}
