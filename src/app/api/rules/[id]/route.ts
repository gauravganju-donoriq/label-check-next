import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { RuleSet } from "@/types";
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

// GET single rule set (admin only, org-scoped)
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

  const ruleSet = await verifyOrgOwnership(id, session.user.email || "");

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  return NextResponse.json(ruleSet);
}

// PUT update rule set (admin only, org-scoped)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can update rule sets
  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify rule set belongs to admin's org
  const existingRuleSet = await verifyOrgOwnership(id, session.user.email || "");
  if (!existingRuleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, stateName, stateAbbreviation, productType } = body;

  const ruleSet = await queryOne<RuleSet>(
    `UPDATE rule_sets 
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         state_name = COALESCE($3, state_name),
         state_abbreviation = COALESCE($4, state_abbreviation),
         product_type = COALESCE($5, product_type),
         updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [name, description, stateName, stateAbbreviation, productType, id]
  );

  return NextResponse.json(ruleSet);
}

// DELETE rule set (admin only, org-scoped)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can delete rule sets
  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify rule set belongs to admin's org
  const existingRuleSet = await verifyOrgOwnership(id, session.user.email || "");
  if (!existingRuleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  await query(`DELETE FROM rule_sets WHERE id = $1`, [id]);

  return NextResponse.json({ success: true });
}

