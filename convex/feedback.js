import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

const getUserId = async (ctx, token) => {
  if (!token) throw new ConvexError("Unauthorized");
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", token)).unique();
  if (!session) throw new ConvexError("Invalid session");
  return session.userId;
};

const requireAdmin = async (ctx, token) => {
  const userId = await getUserId(ctx, token);
  const user = await ctx.db.get(userId);
  if (!user || user.role !== "developer") throw new ConvexError("Forbidden: Not a developer");
  return user;
};

export const submit = mutation({
  args: { token: v.string(), message: v.string() },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx, args.token);
    await ctx.db.insert("feedbacks", {
      userId,
      message: args.message,
      status: "pending",
      createdAt: Date.now(),
    });
  }
});

export const getMyFeedback = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    try {
      const userId = await getUserId(ctx, args.token);
      return await ctx.db.query("feedbacks")
        .withIndex("by_userId", q => q.eq("userId", userId))
        .order("desc")
        .collect();
    } catch {
      return [];
    }
  }
});

export const getAllFeedback = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    const feedbacks = await ctx.db.query("feedbacks").order("desc").collect();
    
    // Enrich with user email
    return Promise.all(feedbacks.map(async f => {
      const user = await ctx.db.get(f.userId);
      return { ...f, userEmail: user?.email || "Unknown" };
    }));
  }
});

export const resolveFeedback = mutation({
  args: { adminToken: v.string(), feedbackId: v.id("feedbacks"), reply: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    
    await ctx.db.patch(args.feedbackId, {
      status: "resolved",
      adminReply: args.reply
    });
  }
});
