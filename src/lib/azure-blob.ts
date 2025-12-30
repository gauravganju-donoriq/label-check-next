import {
  BlobServiceClient,
  ContainerClient,
} from "@azure/storage-blob";

let containerClient: ContainerClient | null = null;

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

