import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { ComplianceRule, RuleSet } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET all rules in a rule set
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify user owns the rule set
  const ruleSet = await queryOne<RuleSet>(
    `SELECT id FROM rule_sets WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

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

// POST add new rule to rule set
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify user owns the rule set
  const ruleSet = await queryOne<RuleSet>(
    `SELECT id FROM rule_sets WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

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

