import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateSasUrl } from "@/lib/azure-blob";
import { queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { ComplianceCheck } from "@/types";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fileName, panelType, checkId } = body;

    if (!fileName) {
      return NextResponse.json(
        { error: "File name is required" },
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

    // Verify user owns the check
    const check = await queryOne<ComplianceCheck>(
      `SELECT id FROM compliance_checks WHERE id = $1 AND user_id = $2`,
      [checkId, session.user.id]
    );

    if (!check) {
      return NextResponse.json({ error: "Check not found" }, { status: 404 });
    }

    // Generate SAS URL for direct upload
    const sasResult = await generateSasUrl(fileName, session.user.id);

    return NextResponse.json({
      sasUrl: sasResult.sasUrl,
      blobUrl: sasResult.blobUrl,
      blobName: sasResult.blobName,
      contentType: sasResult.contentType,
    });
  } catch (error) {
    console.error("Error generating SAS URL:", error);
    return NextResponse.json(
      { error: "Failed to generate upload URL" },
      { status: 500 }
    );
  }
}

