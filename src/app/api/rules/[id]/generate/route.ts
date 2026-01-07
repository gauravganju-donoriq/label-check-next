import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { ComplianceRule, RuleSet } from "@/types";

// Extend Vercel function timeout (max depends on your plan: 60s hobby, 300s pro)
export const maxDuration = 300; // 5 minutes

interface RouteParams {
  params: Promise<{ id: string }>;
}

// External API response types
interface ExtractedRule {
  rule_name: string;
  rule_description: string;
  rule_text_citation: string;
  status: "new" | "updated" | "unchanged";
  change_reason: string | null;
}
                                                                                                                        
interface ExtractionApiResponse {
  success: boolean;
  state: string;
  product_type: string;
  source_url: string;
  total_rules_extracted: number;
  rules: ExtractedRule[];
  error?: string;
}

// Map rule name to a category based on keywords
function inferCategory(ruleName: string, ruleDescription: string): string {
  const text = `${ruleName} ${ruleDescription}`.toLowerCase();

  if (text.includes("warning") || text.includes("keep out") || text.includes("addictive") || text.includes("intoxicating")) {
    return "Required Warnings";
  }
  if (text.includes("symbol") || text.includes("icon") || text.includes("universal")) {
    return "Symbols & Icons";
  }
  if (text.includes("ingredient") || text.includes("allergen")) {
    return "Ingredient Panels";
  }
  if (text.includes("net weight") || text.includes("net quantity") || text.includes("net contents")) {
    return "Net Weight Format";
  }
  if (text.includes("placement") || text.includes("display") || text.includes("font") || text.includes("legib")) {
    return "Placement Rules";
  }
  if (text.includes("thc") || text.includes("cbd") || text.includes("cannabinoid") || text.includes("potency")) {
    return "THC Content";
  }
  if (text.includes("manufacturer") || text.includes("licensee") || text.includes("producer")) {
    return "Manufacturer Info";
  }
  if (text.includes("batch") || text.includes("test") || text.includes("certificate") || text.includes("qr code")) {
    return "Batch & Testing";
  }

  return "General";
}

// POST: Generate rules from external API
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify user owns the rule set and get its details
  const ruleSet = await queryOne<RuleSet>(
    `SELECT * FROM rule_sets WHERE id = $1 AND user_id = $2`,
    [id, session.user.id]
  );

  if (!ruleSet) {
    return NextResponse.json({ error: "Rule set not found" }, { status: 404 });
  }

  // Get existing rules for comparison
  const existingRules = await query<ComplianceRule>(
    `SELECT * FROM compliance_rules WHERE rule_set_id = $1`,
    [id]
  );

  // Map state name to API format (lowercase, no spaces)
  const stateName = ruleSet.state_name?.toLowerCase().replace(/\s+/g, "-") || "montana";

  // The API supports: flower, concentrates, edibles, topicals
  const apiProductType: string = ruleSet.product_type;

  // Prepare existing rules for comparison (format expected by external API)
  const existingRulesForApi = existingRules.map((rule) => ({
    rule_name: rule.name,
    rule_description: rule.validation_prompt,
    rule_text_citation: rule.source_citation || "",
  }));

  try {
    // Call external API with extended timeout (3 minutes for AI processing)
    const apiUrl = process.env.RULES_EXTRACTION_API_URL || "http://localhost:8000";
    console.log(`Calling external API: ${apiUrl}/api/v1/extract-rules`);
    console.log(`Request: state=${stateName}, product_type=${apiProductType}, existing_rules=${existingRulesForApi.length}`);
    
    const response = await fetch(`${apiUrl}/api/v1/extract-rules`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Connection": "keep-alive",
      },
      body: JSON.stringify({
        state: stateName,
        product_type: apiProductType,
        existing_rules: existingRulesForApi,
      }),
    });
    
    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("External API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch rules from external API" },
        { status: 502 }
      );
    }

    const data: ExtractionApiResponse = await response.json();

    if (!data.success) {
      return NextResponse.json(
        { error: data.error || "External API returned an error" },
        { status: 502 }
      );
    }

    // Process rules based on status
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const rule of data.rules) {
      const category = inferCategory(rule.rule_name, rule.rule_description);

      if (rule.status === "new") {
        // Insert new rule
        await queryOne<ComplianceRule>(
          `INSERT INTO compliance_rules 
           (rule_set_id, name, description, category, severity, validation_prompt, source_citation, generation_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            id,
            rule.rule_name,
            rule.rule_description,
            category,
            "error", // Default severity
            rule.rule_description, // Use description as validation prompt
            rule.rule_text_citation,
            rule.status, // 'new'
          ]
        );
        added++;
      } else if (rule.status === "updated") {
        // Find existing rule by source_citation and update it
        const existingRule = existingRules.find(
          (r) => r.source_citation === rule.rule_text_citation
        );

        if (existingRule) {
          await query(
            `UPDATE compliance_rules 
             SET name = $1, description = $2, validation_prompt = $2, category = $3, generation_status = $4, updated_at = NOW()
             WHERE id = $5`,
            [rule.rule_name, rule.rule_description, category, rule.status, existingRule.id]
          );
          updated++;
        } else {
          // If we can't find by citation, insert as new
          await queryOne<ComplianceRule>(
            `INSERT INTO compliance_rules 
             (rule_set_id, name, description, category, severity, validation_prompt, source_citation, generation_status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
              id,
              rule.rule_name,
              rule.rule_description,
              category,
              "error",
              rule.rule_description,
              rule.rule_text_citation,
              "new", // Treat as new since we couldn't find original
            ]
          );
          added++;
        }
      } else {
        // unchanged - skip
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      added,
      updated,
      skipped,
      total: data.total_rules_extracted,
      source_url: data.source_url,
    });
  } catch (error) {
    console.error("Error generating rules:", error);
    return NextResponse.json(
      { error: "Failed to generate rules" },
      { status: 500 }
    );
  }
}

