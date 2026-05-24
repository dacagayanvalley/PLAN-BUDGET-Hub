import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const auditFields = {
  createdAt: v.number(),
  updatedAt: v.number(),
  createdBy: v.string(),
  updatedBy: v.string(),
};

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

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    role: v.string(),
    office: v.optional(v.string()),
    status: v.string(),
    ...auditFields,
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  proposals: defineTable({
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
    nepAmount: v.number(),
    gaaAmount: v.number(),
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
    validationStatus: v.string(),
    edited: v.boolean(),
    searchText: v.string(),
    budgetLines: v.array(budgetLine),
    physicalTargets: v.array(physicalTarget),
    ...auditFields,
  })
    .index("by_proposalId", ["proposalId"])
    .index("by_fiscalYear", ["fiscalYear"])
    .index("by_fiscalYear_status", ["fiscalYear", "validationStatus"])
    .index("by_fiscalYear_edited", ["fiscalYear", "edited"])
    .index("by_fiscalYear_program", ["fiscalYear", "program"])
    .index("by_fiscalYear_office", ["fiscalYear", "office"])
    .index("by_fiscalYear_province", ["fiscalYear", "province"])
    .index("by_fiscalYear_municipality", ["fiscalYear", "municipality"])
    .searchIndex("search_records", {
      searchField: "searchText",
      filterFields: ["fiscalYear", "validationStatus", "program", "office", "province"],
    }),

  validationIssues: defineTable({
    proposalId: v.string(),
    fiscalYear: v.string(),
    status: v.string(),
    issueCode: v.string(),
    issueGroup: v.string(),
    message: v.string(),
    severity: v.string(),
    resolved: v.boolean(),
    ...auditFields,
  })
    .index("by_proposal", ["proposalId"])
    .index("by_fiscalYear_status", ["fiscalYear", "status"])
    .index("by_fiscalYear_issueGroup", ["fiscalYear", "issueGroup"])
    .index("by_fiscalYear_resolved", ["fiscalYear", "resolved"]),

  municipalities: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    province: v.string(),
    district: v.string(),
    psgc: v.optional(v.string()),
    searchText: v.string(),
    ...auditFields,
  })
    .index("by_name", ["name"])
    .index("by_province", ["province"])
    .searchIndex("search_municipalities", { searchField: "searchText", filterFields: ["province", "district"] }),

  interventionTypes: defineTable({
    code: v.optional(v.string()),
    name: v.string(),
    program: v.optional(v.string()),
    mfo: v.optional(v.string()),
    defaultIndicator: v.optional(v.string()),
    defaultUnit: v.optional(v.string()),
    source: v.optional(v.string()),
    searchText: v.string(),
    ...auditFields,
  })
    .index("by_name", ["name"])
    .index("by_mfo", ["mfo"])
    .searchIndex("search_interventions", { searchField: "searchText", filterFields: ["program", "mfo"] }),

  masterItems: defineTable({
    type: v.string(),
    code: v.optional(v.string()),
    name: v.string(),
    parent: v.optional(v.string()),
    metadata: v.optional(v.any()),
    searchText: v.string(),
    ...auditFields,
  })
    .index("by_type", ["type"])
    .index("by_type_name", ["type", "name"])
    .searchIndex("search_master_items", { searchField: "searchText", filterFields: ["type"] }),

  phaseHistory: defineTable({
    proposalId: v.string(),
    phase: v.string(),
    date: v.string(),
    budgetAmount: v.number(),
    physicalTarget: v.optional(v.string()),
    editor: v.optional(v.string()),
    remarks: v.optional(v.string()),
    ...auditFields,
  })
    .index("by_proposal", ["proposalId"])
    .index("by_proposal_phase", ["proposalId", "phase"]),

  attachments: defineTable({
    proposalId: v.string(),
    type: v.string(),
    name: v.string(),
    driveUrl: v.optional(v.string()),
    storageId: v.optional(v.string()),
    uploadedBy: v.optional(v.string()),
    ...auditFields,
  }).index("by_proposal", ["proposalId"]),

  bulkSubmissions: defineTable({
    submissionId: v.string(),
    fiscalYear: v.string(),
    sourceFile: v.string(),
    program: v.optional(v.string()),
    office: v.optional(v.string()),
    templateCode: v.optional(v.string()),
    phase: v.optional(v.string()),
    status: v.string(),
    remarks: v.optional(v.string()),
    ...auditFields,
  })
    .index("by_submissionId", ["submissionId"])
    .index("by_fiscalYear_status", ["fiscalYear", "status"]),

  auditLogs: defineTable({
    entityType: v.string(),
    entityId: v.string(),
    action: v.string(),
    actor: v.string(),
    summary: v.optional(v.string()),
    diff: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_entity", ["entityType", "entityId"]),
});
