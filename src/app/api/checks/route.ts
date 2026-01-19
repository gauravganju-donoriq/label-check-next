import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { ComplianceCheck, RuleSet } from "@/types";
import { getEmailDomain } from "@/lib/utils";

// GET all checks for user (or org-scoped checks for admin)
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = (session.user as { role?: string }).role === "admin";

  // Admins see all checks from their org, regular users see only their own
  const checks = isAdmin
    ? await query<ComplianceCheck & { rule_set: RuleSet }>(
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
         JOIN "user" u ON u.id = cc.user_id
         WHERE LOWER(SPLIT_PART(u.email, '@', 2)) = $1
         ORDER BY cc.created_at DESC`,
        [getEmailDomain(session.user.email || "")]
      )
    : await query<ComplianceCheck & { rule_set: RuleSet }>(
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

  // Verify rule set belongs to user's org (any user can use rule sets from their org)
  const orgDomain = getEmailDomain(session.user.email || "");
  const ruleSet = await queryOne<RuleSet>(
    `SELECT rs.id FROM rule_sets rs
     JOIN "user" u ON u.id = rs.user_id
     WHERE rs.id = $1 AND LOWER(SPLIT_PART(u.email, '@', 2)) = $2`,
    [ruleSetId, orgDomain]
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

