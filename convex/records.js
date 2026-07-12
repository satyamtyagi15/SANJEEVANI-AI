import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Save a new record
export const saveRecord = mutation({
  args: {
    patientId: v.string(),
    type: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("savedRecords", {
      patientId: args.patientId,
      type: args.type,
      data: args.data,
      savedAt: Date.now(),
    });
  },
});

// Fetch all saved records
export const getAllRecords = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("savedRecords")
      .order("desc")
      .collect();
  },
});

// Delete a specific record
export const deleteRecord = mutation({
  args: { recordId: v.id("savedRecords") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.recordId);
  },
});
