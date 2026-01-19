import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { RuleSet } from "@/types";
import { getEmailDomain } from "@/lib/utils";

// GET all rule sets for the admin's organization (admin only)
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can access rules
  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get org-scoped rule sets (all rule sets created by users in the same org/email domain)
  const orgDomain = getEmailDomain(session.user.email || "");

  const ruleSets = await query<RuleSet & { rules_count: string }>(
    `SELECT rs.*, COUNT(cr.id)::text as rules_count 
     FROM rule_sets rs 
     JOIN "user" u ON u.id = rs.user_id
     LEFT JOIN compliance_rules cr ON cr.rule_set_id = rs.id 
     WHERE LOWER(SPLIT_PART(u.email, '@', 2)) = $1
     GROUP BY rs.id 
     ORDER BY rs.created_at DESC`,
    [orgDomain]
  );

  // Convert rules_count from string to number
  const result = ruleSets.map((rs) => ({
    ...rs,
    rules_count: parseInt(rs.rules_count, 10),
  }));

  return NextResponse.json(result);
}

// POST create new rule set (admin only)
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can create rule sets
  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, description, stateName, stateAbbreviation, productType } = body;

  if (!name || !productType) {
    return NextResponse.json(
      { error: "Name and product type are required" },
      { status: 400 }
    );
  }

  const ruleSet = await queryOne<RuleSet>(
    `INSERT INTO rule_sets (user_id, name, description, state_name, state_abbreviation, product_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      session.user.id,
      name,
      description || null,
      stateName || null,
      stateAbbreviation || null,
      productType,
    ]
  );

  return NextResponse.json(ruleSet, { status: 201 });
}

