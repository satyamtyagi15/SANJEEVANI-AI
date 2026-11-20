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
  args: { 
    email: v.string(), 
    password: v.string(), 
    name: v.optional(v.string()),
    role: v.optional(v.string()), // "patient" or "doctor"
    specialization: v.optional(v.string()),
    qualification: v.optional(v.string()),
    experience: v.optional(v.string()),
    hospital: v.optional(v.string()),
    availableHours: v.optional(v.string()),
    consultationFee: v.optional(v.string()),
    bio: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
    if (existing) throw new ConvexError("Email is already registered. Please sign in instead.");
    
    // Developer account check
    let userRole = args.email === "satyamtyagiji15@gmail.com" ? "developer" : (args.role || "patient");
    
    const userId = await ctx.db.insert("users", {
      email: args.email,
      password: args.password,
      name: args.name,
      role: userRole,
      isBanned: false,
      createdAt: Date.now(),
      specialization: args.specialization,
      qualification: args.qualification,
      experience: args.experience,
      hospital: args.hospital,
      availableHours: args.availableHours,
      consultationFee: args.consultationFee,
      bio: args.bio,
      phone: args.phone,
    });

    // If registered as doctor, save doctor_profile into savedRecords for live directory sync
    if (userRole === "doctor") {
      const docName = args.name ? (args.name.startsWith("Dr.") ? args.name : `Dr. ${args.name}`) : `Dr. ${args.email.split("@")[0]}`;
      await ctx.db.insert("savedRecords", {
        patientId: args.email,
        type: "doctor_profile",
        data: {
          id: userId,
          name: docName,
          email: args.email,
          role: "doctor",
          specialization: args.specialization || "General Medicine & Tele-Consultant",
          qualification: args.qualification || "MBBS, MD",
          experience: args.experience || "5+ Years",
          hospital: args.hospital || "Sanjeevani AI Hospital & Tele-Care",
          availableHours: args.availableHours || "Mon - Sat: 10:00 AM - 06:00 PM",
          fee: args.consultationFee || "₹500 / session",
          phone: args.phone || "",
          bio: args.bio || "Certified medical practitioner on Sanjeevani AI Clinical Network.",
          rating: "5.0 ★",
          isOnline: true,
        },
        savedAt: Date.now(),
      });
    }
    
    const token = crypto.randomUUID();
    await ctx.db.insert("sessions", { userId, token, createdAt: Date.now() });
    
    // Schedule welcome email via Brevo safely
    try {
      await ctx.scheduler.runAfter(0, api.email.sendWelcomeEmail, { 
        email: args.email, 
        name: args.name 
      });
    } catch (e) {
      console.warn("Welcome email trigger warning:", e);
    }
    
    return { token, role: userRole };
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
    
    const token = crypto.randomUUID();
    await ctx.db.insert("sessions", { userId: user._id, token, createdAt: Date.now() });
    
    return { token, role: user.role };
  }
});

// Google Login check
export const googleLogin = mutation({
  args: { email: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let user = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", args.email)).unique();
    if (user) {
      if (user.isBanned) throw new ConvexError("Account has been banned by the developer");
      const token = crypto.randomUUID();
      await ctx.db.insert("sessions", { userId: user._id, token, createdAt: Date.now() });
      return { status: "logged_in", token, role: user.role };
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
      specialization: user.specialization,
      qualification: user.qualification,
      experience: user.experience,
      hospital: user.hospital,
      availableHours: user.availableHours,
      consultationFee: user.consultationFee,
      bio: user.bio,
      phone: user.phone,
    };
  }
});

// Update Doctor Profile
export const updateDoctorProfile = mutation({
  args: {
    token: v.string(),
    name: v.optional(v.string()),
    specialization: v.optional(v.string()),
    qualification: v.optional(v.string()),
    experience: v.optional(v.string()),
    hospital: v.optional(v.string()),
    availableHours: v.optional(v.string()),
    consultationFee: v.optional(v.string()),
    bio: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx, args.token);
    if (!user) throw new ConvexError("Unauthorized");
    
    await ctx.db.patch(user._id, {
      ...(args.name !== undefined && { name: args.name }),
      ...(args.specialization !== undefined && { specialization: args.specialization }),
      ...(args.qualification !== undefined && { qualification: args.qualification }),
      ...(args.experience !== undefined && { experience: args.experience }),
      ...(args.hospital !== undefined && { hospital: args.hospital }),
      ...(args.availableHours !== undefined && { availableHours: args.availableHours }),
      ...(args.consultationFee !== undefined && { consultationFee: args.consultationFee }),
      ...(args.bio !== undefined && { bio: args.bio }),
      ...(args.phone !== undefined && { phone: args.phone }),
    });

    const docName = args.name || user.name || user.email;
    const existingRec = await ctx.db.query("savedRecords")
      .withIndex("by_patientId", q => q.eq("patientId", user.email))
      .filter(q => q.eq(q.field("type"), "doctor_profile"))
      .first();

    const profileData = {
      id: user._id,
      name: docName.startsWith("Dr.") ? docName : `Dr. ${docName}`,
      email: user.email,
      role: "doctor",
      specialization: args.specialization || user.specialization || "General Medicine & Tele-Consultant",
      qualification: args.qualification || user.qualification || "MBBS, MD",
      experience: args.experience || user.experience || "5+ Years",
      hospital: args.hospital || user.hospital || "Sanjeevani AI Hospital & Tele-Care",
      availableHours: args.availableHours || user.availableHours || "Mon - Sat: 10:00 AM - 06:00 PM",
      fee: args.consultationFee || user.consultationFee || "₹500 / session",
      phone: args.phone || user.phone || "",
      bio: args.bio || user.bio || "",
      rating: "5.0 ★",
      isOnline: true,
    };

    if (existingRec) {
      await ctx.db.patch(existingRec._id, { data: profileData, savedAt: Date.now() });
    } else {
      await ctx.db.insert("savedRecords", {
        patientId: user.email,
        type: "doctor_profile",
        data: profileData,
        savedAt: Date.now(),
      });
    }

    return { success: true };
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

export const banUser = mutation({
  args: { adminToken: v.string(), targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    const user = await ctx.db.get(args.targetUserId);
    if (user.role === "developer") throw new ConvexError("Cannot ban a developer");
    await ctx.db.patch(args.targetUserId, { isBanned: !user.isBanned });
  }
});

export const deleteUserAccount = mutation({
  args: { adminToken: v.string(), targetUserId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    const user = await ctx.db.get(args.targetUserId);
    if (!user) return;
    if (user.role === "developer") throw new ConvexError("Cannot delete a developer");
    
    // Delete their sessions
    const sessions = await ctx.db.query("sessions").filter(q => q.eq(q.field("userId"), args.targetUserId)).collect();
    for (const s of sessions) {
      await ctx.db.delete(s._id);
    }

    // Delete associated savedRecords (Doctor Profile, Access Requests, Approvals)
    if (user.email) {
      const records = await ctx.db.query("savedRecords")
        .withIndex("by_patientId", q => q.eq("patientId", user.email))
        .collect();
      for (const r of records) {
        await ctx.db.delete(r._id);
      }
    }

    await ctx.db.delete(args.targetUserId);
  }
});

export const cleanupAllDummyDoctorProfiles = mutation({
  args: { adminToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    const doctorProfiles = await ctx.db.query("savedRecords")
      .filter(q => q.eq(q.field("type"), "doctor_profile"))
      .collect();
    
    let deletedCount = 0;
    for (const dp of doctorProfiles) {
      const email = dp.data?.email || dp.patientId;
      const user = await ctx.db.query("users").withIndex("by_email", q => q.eq("email", email)).unique();
      if (!user || user.role !== "doctor") {
        await ctx.db.delete(dp._id);
        deletedCount++;
      }
    }
    return { deletedCount };
  }
});

export const changeUserPassword = mutation({
  args: { adminToken: v.string(), targetUserId: v.id("users"), newPassword: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.adminToken);
    await ctx.db.patch(args.targetUserId, { password: args.newPassword });
  }
});
