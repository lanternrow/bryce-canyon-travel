// Temporary debug route — check which R2 env vars are set on production
// DELETE THIS FILE after confirming env vars are correct
export async function loader() {
  return Response.json({
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID ? `set (${process.env.R2_ACCOUNT_ID.slice(0, 6)}...)` : "MISSING",
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ? `set (${process.env.R2_ACCESS_KEY_ID.slice(0, 6)}...)` : "MISSING",
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ? `set (${process.env.R2_SECRET_ACCESS_KEY.slice(0, 6)}...)` : "MISSING",
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "NOT SET (defaults to bryce-canyon-travel)",
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL || "NOT SET",
  });
}
