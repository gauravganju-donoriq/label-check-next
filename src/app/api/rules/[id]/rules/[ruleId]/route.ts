import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { ComplianceRule, RuleSet } from "@/types";
import { getEmailDomain } from "@/lib/utils";

interface RouteParams {
  params: Promise<{ id: string; ruleId: string }>;
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

// PUT update a rule (admin only, org-scoped)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can update rules
  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, ruleId } = await params;

  // Verify rule set belongs to admin's org
  const ruleSet = await verifyOrgOwnership(id, session.user.email || "");

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, category, severity, validationPrompt, isActive } =
    body;

  const rule = await queryOne<ComplianceRule>(
    `UPDATE compliance_rules 
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         severity = COALESCE($4, severity),
         validation_prompt = COALESCE($5, validation_prompt),
         is_active = COALESCE($6, is_active),
         updated_at = NOW()
     WHERE id = $7 AND rule_set_id = $8
     RETURNING *`,
    [name, description, category, severity, validationPrompt, isActive, ruleId, id]
  );

  if (!rule) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  return NextResponse.json(rule);
}

// DELETE a rule (admin only, org-scoped)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only admins can delete rules
  const isAdmin = (session.user as { role?: string }).role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, ruleId } = await params;

  // Verify rule set belongs to admin's org
  const ruleSet = await verifyOrgOwnership(id, session.user.email || "");

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  const result = await query(
    `DELETE FROM compliance_rules WHERE id = $1 AND rule_set_id = $2 RETURNING id`,
    [ruleId, id]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

