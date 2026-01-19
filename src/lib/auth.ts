import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "dev-secret-please-change-in-production",
  database: pool,
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // Only admins can create users via admin panel
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes - session cached in cookie, reduces DB queries
    },
  },
  trustedOrigins: [
    // Add your production domain
    "https://label-check-next.vercel.app",
    // Vercel preview deployments - matches any preview URL for this project
    "https://*.vercel.app",
  ],
  plugins: [nextCookies(), admin()],
});

