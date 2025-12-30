import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { headers } from "next/headers";
import { PanelUpload, ComplianceCheck } from "@/types";
import { BlobServiceClient } from "@azure/storage-blob";
import { Readable } from "stream";

// Use Node.js runtime for streaming support
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helper function to convert Web ReadableStream to Node.js Readable
function convertWebStreamToNodeStream(
  webStream: ReadableStream<Uint8Array>
): Readable {
  const reader = webStream.getReader();

  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
        } else {
          this.push(Buffer.from(value));
        }
      } catch (error) {
        this.destroy(error as Error);
      }
    },
  });
}

function getContentType(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    pdf: "application/pdf",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get metadata from headers (since we're streaming the body)
  const fileName = request.headers.get("x-file-name");
  const panelType = request.headers.get("x-panel-type");
  const checkId = request.headers.get("x-check-id");
  const contentType =
    request.headers.get("content-type") || "application/octet-stream";

  if (!fileName) {
    return NextResponse.json(
      { error: "File name is required (x-file-name header)" },
      { status: 400 }
    );
  }

  if (!panelType) {
    return NextResponse.json(
      { error: "Panel type is required (x-panel-type header)" },
      { status: 400 }
    );
  }

  if (!checkId) {
    return NextResponse.json(
      { error: "Check ID is required (x-check-id header)" },
      { status: 400 }
    );
  }

  if (!request.body) {
    return NextResponse.json({ error: "No body provided" }, { status: 400 });
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
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME!;

    if (!connectionString) {
      throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
    }

    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Create container if it doesn't exist
    await containerClient.createIfNotExists({ access: "blob" });

    // Generate unique blob name
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const blobName = `${session.user.id}/${timestamp}_${sanitizedFileName}`;

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Convert Web ReadableStream to Node.js Readable and stream directly to Azure
    const nodeStream = convertWebStreamToNodeStream(request.body);

    await blockBlobClient.uploadStream(
      nodeStream,
      4 * 1024 * 1024, // Buffer size: 4MB
      5, // Max concurrency: 5
      {
        blobHTTPHeaders: {
          blobContentType: contentType || getContentType(fileName),
        },
      }
    );

    const blobUrl = blockBlobClient.url;

    // Create panel record in database
    const panel = await queryOne<PanelUpload>(
      `INSERT INTO panel_uploads (compliance_check_id, panel_type, blob_url, file_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [checkId, panelType, blobUrl, fileName]
    );

    return NextResponse.json(panel, { status: 201 });
  } catch (error) {
    console.error("Stream upload error:", error);
    return NextResponse.json(
      {
        error: "Failed to upload file",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

