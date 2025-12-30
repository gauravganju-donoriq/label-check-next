import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadToBlob } from "@/lib/azure-blob";
import { queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { PanelUpload, ComplianceCheck } from "@/types";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const panelType = formData.get("panelType") as string;
  const checkId = formData.get("checkId") as string;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
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

  // Verify user owns the check
  const check = await queryOne<ComplianceCheck>(
    `SELECT id FROM compliance_checks WHERE id = $1 AND user_id = $2`,
    [checkId, session.user.id]
  );

  if (!check) {
    return NextResponse.json({ error: "Check not found" }, { status: 404 });
  }

  try {
    // Upload to Azure Blob Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const blobUrl = await uploadToBlob(buffer, file.name, session.user.id);

    // Create panel record in database
    const panel = await queryOne<PanelUpload>(
      `INSERT INTO panel_uploads (compliance_check_id, panel_type, blob_url, file_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [checkId, panelType, blobUrl, file.name]
    );

    return NextResponse.json(panel, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

