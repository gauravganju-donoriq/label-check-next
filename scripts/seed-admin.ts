/**
 * Seed script to create the first admin user.
 *
 * Usage:
 *   npx tsx scripts/seed-admin.ts
 *
 * Environment variables required:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - BETTER_AUTH_SECRET: Auth secret (same as in auth.ts)
 *
 * You can customize the admin credentials below or pass them as env vars:
 *   - ADMIN_EMAIL (default: admin@example.com)
 *   - ADMIN_PASSWORD (default: AdminPassword123!)
 *   - ADMIN_NAME (default: Admin User)
 */

import { Pool } from "pg";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminPassword123!";
const ADMIN_NAME = process.env.ADMIN_NAME || "Admin User";

async function seedAdmin() {
  console.log("🌱 Starting admin seed...\n");

  // Use SSL for production (Azure), skip for local development
  const useSSL = process.env.DATABASE_URL?.includes("azure") || 
                 process.env.DATABASE_URL?.includes("neon") ||
                 process.env.USE_SSL === "true";
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });

  // Initialize better-auth with admin plugin
  const auth = betterAuth({
    secret:
      process.env.BETTER_AUTH_SECRET ||
      "dev-secret-please-change-in-production",
    database: pool,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [admin()],
  });

  try {
    // Check if admin already exists
    const existingUser = await pool.query(
      'SELECT id, email, role FROM "user" WHERE email = $1',
      [ADMIN_EMAIL]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      if (user.role === "admin") {
        console.log(`✅ Admin user already exists: ${ADMIN_EMAIL}`);
        console.log(`   User ID: ${user.id}`);
      } else {
        // Update existing user to admin role
        await pool.query('UPDATE "user" SET role = $1 WHERE email = $2', [
          "admin",
          ADMIN_EMAIL,
        ]);
        console.log(`✅ Updated existing user to admin: ${ADMIN_EMAIL}`);
        console.log(`   User ID: ${user.id}`);
      }
    } else {
      // Create new admin user using better-auth API
      const result = await auth.api.signUpEmail({
        body: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          name: ADMIN_NAME,
        },
      });

      if (result.user) {
        // Update the user role to admin
        await pool.query('UPDATE "user" SET role = $1 WHERE id = $2', [
          "admin",
          result.user.id,
        ]);

        console.log(`✅ Admin user created successfully!`);
        console.log(`   Email: ${ADMIN_EMAIL}`);
        console.log(`   Name: ${ADMIN_NAME}`);
        console.log(`   User ID: ${result.user.id}`);
        console.log(`\n📝 Login credentials:`);
        console.log(`   Email: ${ADMIN_EMAIL}`);
        console.log(`   Password: ${ADMIN_PASSWORD}`);
      }
    }
  } catch (error) {
    console.error("❌ Error seeding admin:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }

  console.log("\n🎉 Admin seed completed!");
}

seedAdmin();
