import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from "@azure/storage-blob";

let containerClient: ContainerClient | null = null;
let sharedKeyCredential: StorageSharedKeyCredential | null = null;

function parseConnectionString(connectionString: string): {
  accountName: string;
  accountKey: string;
} {
  const parts = connectionString.split(";");
  let accountName = "";
  let accountKey = "";

  for (const part of parts) {
    if (part.startsWith("AccountName=")) {
      accountName = part.substring("AccountName=".length);
    } else if (part.startsWith("AccountKey=")) {
      accountKey = part.substring("AccountKey=".length);
    }
  }

  if (!accountName || !accountKey) {
    throw new Error("Invalid connection string: missing AccountName or AccountKey");
  }

  return { accountName, accountKey };
}

function getSharedKeyCredential(): StorageSharedKeyCredential {
  if (sharedKeyCredential) return sharedKeyCredential;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
  }

  const { accountName, accountKey } = parseConnectionString(connectionString);
  sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

  return sharedKeyCredential;
}

function getContainerClient(): ContainerClient {
  if (containerClient) return containerClient;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME!;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  containerClient = blobServiceClient.getContainerClient(containerName);

  return containerClient;
}

export async function uploadToBlob(
  buffer: Buffer,
  fileName: string,
  userId: string
): Promise<string> {
  const container = getContainerClient();

  // Create container if it doesn't exist
  await container.createIfNotExists({ access: "blob" });

  // Generate unique blob name
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const blobName = `${userId}/${timestamp}_${sanitizedFileName}`;

  const blockBlobClient = container.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: getContentType(fileName),
    },
  });

  return blockBlobClient.url;
}

export async function deleteFromBlob(blobUrl: string): Promise<void> {
  const container = getContainerClient();

  // Extract blob name from URL
  const url = new URL(blobUrl);
  const blobName = url.pathname.split("/").slice(2).join("/");

  const blockBlobClient = container.getBlockBlobClient(blobName);
  await blockBlobClient.deleteIfExists();
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

export interface SasUrlResult {
  sasUrl: string;
  blobUrl: string;
  blobName: string;
  contentType: string;
}

export async function generateSasUrl(
  fileName: string,
  userId: string
): Promise<SasUrlResult> {
  const container = getContainerClient();
  const credential = getSharedKeyCredential();
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME!;

  // Create container if it doesn't exist
  await container.createIfNotExists({ access: "blob" });

  // Generate unique blob name
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const blobName = `${userId}/${timestamp}_${sanitizedFileName}`;
  const contentType = getContentType(fileName);

  // Generate SAS token with write permissions, valid for 10 minutes
  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + 10 * 60 * 1000); // 10 minutes

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("cw"), // create and write
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
      contentType, // Set content type in SAS
    },
    credential
  ).toString();

  const blockBlobClient = container.getBlockBlobClient(blobName);
  const blobUrl = blockBlobClient.url;
  const sasUrl = `${blobUrl}?${sasToken}`;

  return {
    sasUrl,
    blobUrl,
    blobName,
    contentType,
  };
}

export async function downloadBlobAsBase64(blobUrl: string): Promise<string> {
  const container = getContainerClient();

  // Extract blob name from URL
  const url = new URL(blobUrl);
  // URL format: https://account.blob.core.windows.net/container/userId/timestamp_filename
  // pathname is /container/userId/timestamp_filename, we need userId/timestamp_filename
  const pathParts = url.pathname.split("/");
  const blobName = pathParts.slice(2).join("/"); // Skip first empty part and container name

  const blockBlobClient = container.getBlockBlobClient(blobName);

  // Download the blob
  const downloadResponse = await blockBlobClient.download(0);

  if (!downloadResponse.readableStreamBody) {
    throw new Error("No readable stream body in download response");
  }

  // Convert stream to buffer
  const chunks: Buffer[] = [];
  for await (const chunk of downloadResponse.readableStreamBody) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);

  // Convert to base64
  const base64 = buffer.toString("base64");
  const contentType = downloadResponse.contentType || "image/jpeg";

  return `data:${contentType};base64,${base64}`;
}

