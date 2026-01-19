import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { ComplianceRule, RuleSet } from "@/types";
import { getEmailDomain } from "@/lib/utils";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Helper to verify rule set belongs to admin's org
async function verifyOrgOwnership(
  ruleSetId: string,
  adminEmail: string
): Promise<RuleSet | null> {
  const orgDomain = getEmailDomain(adminEmail);
  return queryOne<RuleSet>(
    `SELECT rs.* FROM rule_sets rs
     JOIN "user" u ON u.id = rs.user_id
     WHERE rs.id = $1 AND LOWER(SPLIT_PART(u.email, '@', 2)) = $2`,
    [ruleSetId, orgDomain]
  );
}

// GET all rules in a rule set (admin only, org-scoped)
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can access rules
  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify rule set belongs to admin's org
  const ruleSet = await verifyOrgOwnership(id, session.user.email || "");

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  const rules = await query<ComplianceRule>(
    `SELECT * FROM compliance_rules 
     WHERE rule_set_id = $1 
     ORDER BY category, name`,
    [id]
  );

  return NextResponse.json(rules);
}

// POST add new rule to rule set (admin only, org-scoped)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can add rules
  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify rule set belongs to admin's org
  const ruleSet = await verifyOrgOwnership(id, session.user.email || "");

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, category, severity, validationPrompt } = body;

  if (!name || !category || !validationPrompt) {
    return NextResponse.json(
      { error: "Name, category, and validation prompt are required" },
      { status: 400 }
    );
  }

  const rule = await queryOne<ComplianceRule>(
    `INSERT INTO compliance_rules (rule_set_id, name, description, category, severity, validation_prompt)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      id,
      name,
      description || name,
      category,
      severity || "error",
      validationPrompt,
    ]
  );

  return NextResponse.json(rule, { status: 201 });
}

