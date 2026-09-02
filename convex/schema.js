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

  users: defineTable({
    email: v.string(),
    password: v.string(), // Plaintext as explicitly requested
    name: v.optional(v.string()),
    role: v.string(), // "user" or "developer"
    isBanned: v.boolean(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
  }).index("by_token", ["token"]),

  feedbacks: defineTable({
    userId: v.id("users"),
    message: v.string(),
    status: v.string(), // "pending" | "resolved"
    adminReply: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]).index("by_status", ["status"]),
});
