import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { RuleSet } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET single rule set
export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const ruleSet = await queryOne<RuleSet>(
    `SELECT * FROM rule_sets WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  return NextResponse.json(ruleSet);
}

// PUT update rule set
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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
     WHERE id = $6 AND user_id = $7
     RETURNING *`,
    [
      name,
      description,
      stateName,
      stateAbbreviation,
      productType,
      id,
      session.user.id,
    ]
  );

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  return NextResponse.json(ruleSet);
}

// DELETE rule set
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const result = await query(
    `DELETE FROM rule_sets WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, session.user.id]
  );

  if (result.length === 0) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

