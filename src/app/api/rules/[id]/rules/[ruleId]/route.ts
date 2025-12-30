import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { ComplianceRule, RuleSet } from "@/types";

interface RouteParams {
  params: Promise<{ id: string; ruleId: string }>;
}

// PUT update a rule
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, ruleId } = await params;

  // Verify user owns the rule set
  const ruleSet = await queryOne<RuleSet>(
    `SELECT id FROM rule_sets WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

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

// DELETE a rule
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, ruleId } = await params;

  // Verify user owns the rule set
  const ruleSet = await queryOne<RuleSet>(
    `SELECT id FROM rule_sets WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

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

