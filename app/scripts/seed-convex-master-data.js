import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { seedData } from "../src/seed/seedData.js";

loadEnvFile(resolve(process.cwd(), ".env.local"));

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  console.error("Missing VITE_CONVEX_URL. Run `npx convex dev` first, then retry this seed command.");
  process.exit(1);
}

const master = seedData.masterData;
const client = new ConvexHttpClient(convexUrl);
const login = await client.mutation(anyApi.auth.login, {
  name: process.env.PLAN_BUDGET_ADMIN_USER || "System Admin",
  password: process.env.PLAN_BUDGET_ADMIN_PASSWORD || "PlanBudget2027!",
}).catch(() => ({ sessionToken: undefined }));

const result = await client.mutation(anyApi.seed.seedMasterData, {
  users: seedData.users.map((user) => ({
    name: user.name,
    role: user.role,
    office: user.office,
  })),
  municipalities: master.municipalities,
  offices: master.offices,
  programs: master.programs,
  mfos: master.mfos,
  commodities: master.commodities,
  interventionTypes: master.interventionTypes,
  indicators: master.indicators,
  unitsOfMeasure: master.unitsOfMeasure,
  objectCodes: master.objectCodes,
  expenseClasses: master.expenseClasses,
  climateTags: master.climateTags,
  gedsiTags: master.gedsiTags,
  sessionToken: login.sessionToken,
});

console.log("Convex master data seed completed:");
console.table(result);

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
