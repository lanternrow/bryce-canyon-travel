// Google Service Account authentication via JWT
// Uses the jose library for lightweight RS256 signing

import { SignJWT, importPKCS8 } from "jose";

interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
  token_uri: string;
}

// In-memory token cache keyed by scope (supports multiple Google APIs simultaneously)
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/**
 * Parse the service account JSON from the environment variable.
 */
function getCredentials(): ServiceAccountCredentials | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!parsed.client_email || !parsed.private_key || !parsed.token_uri) {
      console.error("[GoogleAuth] Service account JSON missing required fields");
      return null;
    }
    return parsed;
  } catch (e) {
    console.error("[GoogleAuth] Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", e);
    return null;
  }
}

/**
 * Get a Google OAuth2 access token for the given scope.
 * Caches the token in memory until it expires (with 60s buffer).
 */
export async function getGoogleAccessToken(
  scope: string
): Promise<string | null> {
  // Return cached token if still valid for this scope
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const creds = getCredentials();
  if (!creds) return null;

  try {
    const now = Math.floor(Date.now() / 1000);
    const privateKey = await importPKCS8(creds.private_key, "RS256");

    const jwt = await new SignJWT({ scope })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(creds.client_email)
      .setSubject(creds.client_email)
      .setAudience(creds.token_uri)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    // Exchange JWT for access token
    const response = await fetch(creds.token_uri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[GoogleAuth] Token exchange failed:", response.status, body);
      return null;
    }

    const data = await response.json();

    tokenCache.set(scope, {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    });

    return data.access_token;
  } catch (error) {
    console.error("[GoogleAuth] JWT signing or token exchange failed:", error);
    return null;
  }
}

/**
 * Check if Google service account credentials are configured.
 */
export function hasGoogleCredentials(): boolean {
  return getCredentials() !== null;
}
