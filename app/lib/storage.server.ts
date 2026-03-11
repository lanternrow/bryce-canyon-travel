import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Cloudflare R2 uses S3-compatible API
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "bryce-canyon-travel";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

const s3Client = new S3Client({
  region: "auto",
  endpoint: R2_ACCOUNT_ID
    ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "http://localhost:9000", // fallback for local dev
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  // R2 doesn't support AWS SDK v3's default checksum behavior
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

function generateKey(filename: string): string {
  const uuid = crypto.randomUUID();
  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  const safeName = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 50);
  return `uploads/${uuid}-${safeName}.${ext}`;
}

export function isR2Configured(): boolean {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
}

export async function uploadToR2(file: File): Promise<{
  url: string;
  key: string;
  filename: string;
  size: number;
  mimeType: string;
}> {
  const key = generateKey(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  );

  const url = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `/${key}`;

  return {
    url,
    key,
    filename: file.name,
    size: file.size,
    mimeType: file.type,
  };
}

export async function deleteFromR2(url: string): Promise<void> {
  // Extract key from URL
  let key = url;
  if (R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL)) {
    key = url.slice(R2_PUBLIC_URL.length + 1); // +1 for the /
  } else if (url.startsWith("/")) {
    key = url.slice(1);
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    })
  );
}
