import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import {
  extractLabelData,
  runComplianceCheck,
  generateDefaultRules,
  AnyRule,
  ExtractedLabelData,
} from "@/lib/gemini";
import { downloadBlobAsBase64 } from "@/lib/azure-blob";
import { headers } from "next/headers";
import { ComplianceCheck, ComplianceRule, PanelUpload, RuleSet } from "@/types";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { checkId } = body as {
    checkId: string;
  };

  if (!checkId) {
    return NextResponse.json(
      { error: "Check ID is required" },
      { status: 400 }
    );
  }

  // Verify user owns the check and get rule set details
  const check = await queryOne<
    ComplianceCheck & {
      product_type: string;
      state_name: string | null;
      state_abbreviation: string | null;
    }
  >(
    `SELECT cc.*, rs.product_type, rs.state_name, rs.state_abbreviation
     FROM compliance_checks cc
     JOIN rule_sets rs ON rs.id = cc.rule_set_id
     WHERE cc.id = $1 AND cc.user_id = $2`,
    [checkId, session.user.id]
  );

  if (!check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  // Get panels from database (already uploaded to Azure)
  const panels = await query<PanelUpload>(
    `SELECT * FROM panel_uploads WHERE compliance_check_id = $1`,
    [checkId]
  );

  if (panels.length === 0) {
    return NextResponse.json(
      { error: "No panels found for this check" },
      { status: 400 }
    );
  }

  try {
    // Get rules for the rule set
    const persistedRules = await query<ComplianceRule>(
      `SELECT * FROM compliance_rules 
       WHERE rule_set_id = $1 AND is_active = true`,
      [check.rule_set_id]
    );

    // Determine which rules to use
    let rules: AnyRule[];
    let isGenerated = false;

    if (persistedRules.length === 0) {
      // No custom rules - generate default rules based on state and product type
      console.log(
        `No rules found for rule set. Generating default rules for ${check.state_name} ${check.product_type}...`
      );
      rules = await generateDefaultRules(
        check.state_name,
        check.state_abbreviation,
        check.product_type
      );
      isGenerated = true;
      console.log(`Generated ${rules.length} default rules`);
    } else {
      rules = persistedRules;
    }

    // Extract data from each panel using Gemini (now rule-aware)
    const extractedPanels: Array<{
      panelId: string;
      panelType: string;
      extractedData: ExtractedLabelData;
    }> = [];

    for (const panel of panels) {
      // Fetch image from Azure blob storage using SDK (authenticated)
      const imageBase64 = await downloadBlobAsBase64(panel.blob_url);

      // Pass rules to extraction so it knows what data to extract
      const extracted = await extractLabelData(
        imageBase64,
        panel.panel_type,
        check.product_type,
        rules
      );

      // Update panel with extracted data
      await query(
        `UPDATE panel_uploads SET extracted_data = $1 WHERE id = $2`,
        [JSON.stringify(extracted), panel.id]
      );

      extractedPanels.push({
        panelId: panel.id,
        panelType: panel.panel_type,
        extractedData: extracted,
      });
    }

    // Run compliance check with Gemini
    const { results, summary } = await runComplianceCheck(
      extractedPanels,
      rules
    );

    // Save results - handle differently for generated vs persisted rules
    for (const r of results) {
      if (isGenerated) {
        // For generated rules, store rule details inline
        await query(
          `INSERT INTO check_results (
            compliance_check_id, 
            rule_id, 
            status, 
            found_value, 
            expected_value, 
            explanation,
            is_generated_rule,
            generated_rule_name,
            generated_rule_description,
            generated_rule_category
          )
          VALUES ($1, NULL, $2, $3, $4, $5, true, $6, $7, $8)`,
          [
            checkId,
            r.status,
            r.foundValue,
            r.expectedValue,
            r.explanation,
            r.ruleName || "Unknown Rule",
            r.ruleDescription || null,
            r.ruleCategory || "General",
          ]
        );
      } else {
        // For persisted rules, use foreign key reference
        await query(
          `INSERT INTO check_results (
            compliance_check_id, 
            rule_id, 
            status, 
            found_value, 
            expected_value, 
            explanation,
            is_generated_rule
          )
          VALUES ($1, $2, $3, $4, $5, $6, false)`,
          [
            checkId,
            r.ruleId,
            r.status,
            r.foundValue,
            r.expectedValue,
            r.explanation,
          ]
        );
      }
    }

    // Update compliance check with summary
    await query(
      `UPDATE compliance_checks 
       SET overall_status = $1, 
           pass_count = $2, 
           warning_count = $3, 
           fail_count = $4, 
           completed_at = NOW()
       WHERE id = $5`,
      [
        summary.overallStatus,
        summary.passCount,
        summary.warningCount,
        summary.failCount,
        checkId,
      ]
    );

    return NextResponse.json({
      success: true,
      results,
      summary,
      isGenerated,
    });
  } catch (error) {
    console.error("Analysis error:", error);

    // Clean up the incomplete compliance check
    if (checkId) {
      try {
        // Delete the check and all related records (cascades to panel_uploads and check_results)
        await query(`DELETE FROM compliance_checks WHERE id = $1`, [checkId]);
        console.log(`Deleted incomplete compliance check: ${checkId}`);
      } catch (deleteError) {
        console.error("Failed to delete incomplete check:", deleteError);
      }
    }

    return NextResponse.json(
      {
        error: "Failed to analyze panels",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
