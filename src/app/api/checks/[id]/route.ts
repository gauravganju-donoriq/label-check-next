import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import {
  ComplianceCheck,
  CheckResult,
  PanelUpload,
  ComplianceRule,
} from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET single check with all related data
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Get the compliance check with rule set info
  const check = await queryOne<
    ComplianceCheck & {
      rule_set_name: string;
      rule_set_state_name: string;
      rule_set_state_abbreviation: string;
      rule_set_product_type: string;
    }
  >(
    `SELECT cc.*, 
            rs.name as rule_set_name,
            rs.state_name as rule_set_state_name,
            rs.state_abbreviation as rule_set_state_abbreviation,
            rs.product_type as rule_set_product_type
     FROM compliance_checks cc
     JOIN rule_sets rs ON rs.id = cc.rule_set_id
     WHERE cc.id = $1 AND cc.user_id = $2`,
    [id, session.user.id]
  );

  if (!check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  // Get panels
  const panels = await query<PanelUpload>(
    `SELECT * FROM panel_uploads WHERE compliance_check_id = $1 ORDER BY created_at`,
    [id]
  );

  // Get results with rule info
  const results = await query<CheckResult & { compliance_rule: ComplianceRule }>(
    `SELECT cr.*, 
            json_build_object(
              'id', r.id,
              'name', r.name,
              'description', r.description,
              'category', r.category,
              'severity', r.severity,
              'validation_prompt', r.validation_prompt
            ) as compliance_rule
     FROM check_results cr
     JOIN compliance_rules r ON r.id = cr.rule_id
     WHERE cr.compliance_check_id = $1
     ORDER BY r.category, r.name`,
    [id]
  );

  return NextResponse.json({
    ...check,
    rule_set: {
      id: check.rule_set_id,
      name: check.rule_set_name,
      state_name: check.rule_set_state_name,
      state_abbreviation: check.rule_set_state_abbreviation,
      product_type: check.rule_set_product_type,
    },
    panels,
    results,
  });
}

// DELETE a compliance check
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await query(
    `DELETE FROM compliance_checks WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, session.user.id]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

