import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { ComplianceCheck, RuleSet } from "@/types";

// GET all checks for user
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks = await query<ComplianceCheck & { rule_set: RuleSet }>(
    `SELECT cc.*, 
            json_build_object(
              'id', rs.id,
              'name', rs.name,
              'state_name', rs.state_name,
              'state_abbreviation', rs.state_abbreviation,
              'product_type', rs.product_type
            ) as rule_set
     FROM compliance_checks cc
     JOIN rule_sets rs ON rs.id = cc.rule_set_id
     WHERE cc.user_id = $1
     ORDER BY cc.created_at DESC`,
    [session.user.id]
  );

  return NextResponse.json(checks);
}

// POST create new compliance check
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { ruleSetId, productName } = body;

  if (!ruleSetId) {
    return NextResponse.json(
      { error: "Rule set ID is required" },
      { status: 400 }
    );
  }

  // Verify user owns the rule set
  const ruleSet = await queryOne<RuleSet>(
    `SELECT id FROM rule_sets WHERE id = $1 AND user_id = $2`,
    [ruleSetId, session.user.id]
  );

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  const check = await queryOne<ComplianceCheck>(
    `INSERT INTO compliance_checks (user_id, rule_set_id, product_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [session.user.id, ruleSetId, productName || null]
  );

  return NextResponse.json(check, { status: 201 });
}

