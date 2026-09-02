import { action } from "./_generated/server";
import { v } from "convex/values";

export const sendWelcomeEmail = action({
  args: { email: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // We use the environment variable exclusively to avoid exposing the secret on GitHub
    const brevoApiKey = process.env.BREVO_API_KEY;
    
    if (!brevoApiKey) {
      console.error("BREVO_API_KEY is not set in Convex environment variables.");
      return;
    }

    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "api-key": brevoApiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sender: {
            name: "Sanjeevani AI",
            email: "noreply@sanjeevaniai.com" // Update this if you have a verified domain in Brevo
          },
          to: [
            {
              email: args.email,
              name: args.name || "User"
            }
          ],
          subject: "Welcome to Sanjeevani AI! 🎉",
          htmlContent: `
            <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #ffffff; padding: 20px; border-radius: 8px;">
              <h1 style="color: #3b82f6;">Welcome to Sanjeevani AI!</h1>
              <p>Hi ${args.name || 'there'},</p>
              <p>Thank you for signing up for Sanjeevani AI. We're excited to have you on board.</p>
              <p>You can now log in to the portal and explore our AI healthcare tools.</p>
              <br/>
              <p>Best regards,<br/>The Sanjeevani Team</p>
            </div>
          `
        })
      });

      if (!response.ok) {
        console.error("Failed to send email via Brevo", await response.text());
      }
    } catch (error) {
      console.error("Error sending welcome email:", error);
    }
  }
});
