import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { v, ConvexError } from "convex/values";

// Helper to check if a user is admin
const requireAdmin = async (ctx, token) => {
  if (!token) throw new ConvexError("Unauthorized");
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", token)).unique();
  if (!session) throw new ConvexError("Invalid session");
  const user = await ctx.db.get(session.userId);
  if (!user || user.role !== "developer") throw new ConvexError("Forbidden: Not a developer");
  return user;
};

// Helper to authenticate request
export const getAuthUser = async (ctx, token) => {
  if (!token) return null;
  const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", token)).unique();
  if (!session) return null;
  const user = await ctx.db.get(session.userId);
  if (!user || user.isBanned) return null;
  return user;
};

// Signup
export const signUp = mutation({
  args: { email: v.string(), password: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
    if (existing) throw new ConvexError("Email is already registered. Please sign in instead.");
    
    // Developer account check
    const role = args.email === "satyamtyagiji15@gmail.com" ? "developer" : "user";
    const approvalStatus = role === "developer" ? "approved" : "pending";
    
    const userId = await ctx.db.insert("users", {
      email: args.email,
      password: args.password,
      name: args.name,
      role,
      approvalStatus,
      isBanned: false,
      createdAt: Date.now(),
    });
    
    const token = crypto.randomUUID();
    await ctx.db.insert("sessions", { userId, token, createdAt: Date.now() });
    
    // Schedule welcome email via Brevo
    await ctx.scheduler.runAfter(0, api.email.sendWelcomeEmail, { 
      email: args.email, 
      name: args.name 
    });
    
    return { token, role, approvalStatus };
  }
});

// Login
export const login = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
    if (!user) throw new ConvexError("Invalid email or password");
    if (user.password !== args.password) throw new ConvexError("Invalid email or password");
    if (user.isBanned) throw new ConvexError("Account has been banned by the developer");
    
    // Backfill approvalStatus if missing for older users
    let approvalStatus = user.approvalStatus;
    if (!approvalStatus) {
      approvalStatus = user.role === "developer" ? "approved" : "pending";
      await ctx.db.patch(user._id, { approvalStatus });
    }

    const token = crypto.randomUUID();
    await ctx.db.insert("sessions", { userId: user._id, token, createdAt: Date.now() });
    
    return { token, role: user.role, approvalStatus };
  }
});

// Google Login check
export const googleLogin = mutation({
  args: { email: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let user = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
    if (user) {
      if (user.isBanned) throw new ConvexError("Account has been banned by the developer");
      
      let approvalStatus = user.approvalStatus;
      if (!approvalStatus) {
        approvalStatus = user.role === "developer" ? "approved" : "pending";
        await ctx.db.patch(user._id, { approvalStatus });
      }

      const token = crypto.randomUUID();
      await ctx.db.insert("sessions", { userId: user._id, token, createdAt: Date.now() });
      return { status: "logged_in", token, role: user.role, approvalStatus };
    }
    // If not exists, frontend should prompt for password creation
    return { status: "needs_password" };
  }
});

// Validate Session
export const validateSession = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx, args.token);
    if (!user) return null;
    return { 
      email: user.email, 
      name: user.name, 
      role: user.role,
      approvalStatus: user.role === "developer" ? "approved" : (user.approvalStatus || "pending"),
      userId: user._id
    };
  }
});

// Logout
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.query("sessions").withIndex("by_token", q => q.eq("token", args.token)).unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
  }
});

// ================= ADMIN FUNCTIONS =================

export const getAllUsers = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    return await ctx.db.query("users").collect();
  }
});

// Real-time access requests query for admin notification
export const getPendingAccessRequests = query({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    const allUsers = await ctx.db.query("users").collect();
    // Return users waiting for approval (role != developer and approvalStatus != approved)
    return allUsers.filter(u => u.role !== "developer" && (u.approvalStatus === "pending" || !u.approvalStatus));
  }
});

// Allow or Reject access for a user
export const setApprovalStatus = mutation({
  args: {
    adminToken: v.string(),
    targetUserId: v.id("users"),
    status: v.string(), // "approved" | "rejected" | "pending"
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    const target = await ctx.db.get(args.targetUserId);
    if (!target) throw new ConvexError("User not found");
    if (target.role === "developer") throw new ConvexError("Cannot modify approval status of developer");
    await ctx.db.patch(args.targetUserId, { approvalStatus: args.status });
    return { success: true, status: args.status };
  }
});

export const banUser = mutation({
  args: { adminToken: v.string(), targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    const user = await ctx.db.get(args.targetUserId);
    if (user.role === "developer") throw new ConvexError("Cannot ban a developer");
    await ctx.db.patch(args.targetUserId, { isBanned: !user.isBanned });
  }
});

// Alias for backwards compatibility with DeveloperDashboard
export const toggleBanStatus = banUser;

export const deleteUserAccount = mutation({
  args: { adminToken: v.string(), targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    const user = await ctx.db.get(args.targetUserId);
    if (user.role === "developer") throw new ConvexError("Cannot delete a developer");
    // Delete their sessions
    const sessions = await ctx.db.query("sessions").filter(q => q.eq(q.field("userId"), args.targetUserId)).collect();
    for (const s of sessions) {
      await ctx.db.delete(s._id);
    }
    await ctx.db.delete(args.targetUserId);
  }
});

export const changeUserPassword = mutation({
  args: { adminToken: v.string(), targetUserId: v.id("users"), newPassword: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    await ctx.db.patch(args.targetUserId, { password: args.newPassword });
  }
});
