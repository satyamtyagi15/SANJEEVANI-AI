import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  dischargedPatients: defineTable({
    patientId: v.string(),
    diagnosis: v.string(),
    medications: v.array(v.string()),
    dischargeNotes: v.string(),
    riskLevel: v.string(),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactLink: v.string(), // simulated link for follow-up
    timestamp: v.string(),
  }).index("by_patientId", ["patientId"]),

  guardianAlerts: defineTable({
    patientId: v.string(),
    reportedSymptoms: v.string(),
    aiRiskAssessment: v.string(),
    isCritical: v.boolean(),
    timestamp: v.string(),
    isRead: v.boolean(),
  }).index("by_read_status", ["isRead"]),

  savedRecords: defineTable({
    patientId: v.string(),
    type: v.string(),
    data: v.any(), // Store the entire JSON report payload
    savedAt: v.number(),
  }).index("by_patientId", ["patientId"]),
});
