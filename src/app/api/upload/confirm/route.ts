import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { PanelUpload, ComplianceCheck } from "@/types";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { blobUrl, panelType, checkId, fileName } = body;

    if (!blobUrl) {
      return NextResponse.json(
        { error: "Blob URL is required" },
        { status: 400 }
      );
    }

    if (!panelType) {
      return NextResponse.json(
        { error: "Panel type is required" },
        { status: 400 }
      );
    }

    if (!checkId) {
      return NextResponse.json(
        { error: "Check ID is required" },
        { status: 400 }
      );
    }

    if (!fileName) {
      return NextResponse.json(
        { error: "File name is required" },
        { status: 400 }
      );
    }

    // Verify user owns the check
    const check = await queryOne<ComplianceCheck>(
      `SELECT id FROM compliance_checks WHERE id = $1 AND user_id = $2`,
      [checkId, session.user.id]
    );

    if (!check) {
      return NextResponse.json({ error: "Check not found" }, { status: 404 });
    }

    // Create panel record in database
    const panel = await queryOne<PanelUpload>(
      `INSERT INTO panel_uploads (compliance_check_id, panel_type, blob_url, file_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [checkId, panelType, blobUrl, fileName]
    );

    return NextResponse.json(panel, { status: 201 });
  } catch (error) {
    console.error("Error confirming upload:", error);
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}

