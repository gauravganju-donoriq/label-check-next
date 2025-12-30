import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { extractLabelData, runComplianceCheck } from "@/lib/gemini";
import { headers } from "next/headers";
import {
  ComplianceCheck,
  ComplianceRule,
  PanelUpload,
} from "@/types";

// Helper function to fetch image from Azure and convert to base64
async function fetchImageAsBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image from storage: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const contentType = response.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${base64}`;
}

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

  // Verify user owns the check
  const check = await queryOne<ComplianceCheck & { product_type: string }>(
    `SELECT cc.*, rs.product_type 
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
    const rules = await query<ComplianceRule>(
      `SELECT * FROM compliance_rules 
       WHERE rule_set_id = $1 AND is_active = true`,
      [check.rule_set_id]
    );

    if (rules.length === 0) {
      return NextResponse.json(
        { error: "No active rules found in the rule set" },
        { status: 400 }
      );
    }

    // Extract data from each panel using Gemini
    const extractedPanels: Array<{
      panelId: string;
      panelType: string;
      extractedData: Record<string, unknown>;
    }> = [];

    for (const panel of panels) {
      // Fetch image from Azure blob storage
      const imageBase64 = await fetchImageAsBase64(panel.blob_url);
      
      const extracted = await extractLabelData(
        imageBase64,
        panel.panel_type,
        check.product_type
      );

      // Update panel with extracted data
      await query(
        `UPDATE panel_uploads SET extracted_data = $1 WHERE id = $2`,
        [JSON.stringify(extracted), panel.id]
      );

      extractedPanels.push({
        panelId: panel.id,
        panelType: panel.panel_type,
        extractedData: extracted as unknown as Record<string, unknown>,
      });
    }

    // Run compliance check with Gemini
    const { results, summary } = await runComplianceCheck(
      extractedPanels,
      rules
    );

    // Save results
    for (const r of results) {
      await query(
        `INSERT INTO check_results (compliance_check_id, rule_id, status, found_value, expected_value, explanation)
         VALUES ($1, $2, $3, $4, $5, $6)`,
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

