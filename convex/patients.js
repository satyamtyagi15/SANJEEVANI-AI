import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Log a discharged patient to be tracked by the Guardian Agent
export const dischargePatient = mutation({
  args: {
    patientId: v.string(),
    diagnosis: v.string(),
    medications: v.array(v.string()),
    dischargeNotes: v.string(),
    riskLevel: v.string(),
    contactPhone: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Generate a mock unique link for the patient's SMS
    const contactLink = `/follow-up/${args.patientId}`;
    
    await ctx.db.insert("dischargedPatients", {
      ...args,
      contactLink,
      timestamp: new Date().toISOString(),
    });
    return contactLink;
  },
});

// Retrieve patient data for the follow-up page
export const getPatientDischargeInfo = query({
  args: { patientId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dischargedPatients")
      .withIndex("by_patientId", (q) => q.eq("patientId", args.patientId))
      .first();
  },
});

// Create a new Guardian Alert if relapse is detected
export const logGuardianAlert = mutation({
  args: {
    patientId: v.string(),
    reportedSymptoms: v.string(),
    aiRiskAssessment: v.string(),
    isCritical: v.boolean(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("guardianAlerts", {
      ...args,
      isRead: false,
      timestamp: new Date().toISOString(),
    });
  },
});

// Fetch unread critical alerts for the Doctor Dashboard
export const getActiveAlerts = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("guardianAlerts")
      .withIndex("by_read_status", (q) => q.eq("isRead", false))
      .order("desc")
      .take(10);
  },
});

// Mark alert as read/resolved
export const markAlertResolved = mutation({
  args: { alertId: v.id("guardianAlerts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.alertId, { isRead: true });
  },
});
