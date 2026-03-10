import sql from "./db.server";
import { redirect } from "react-router";
import { siteConfig } from "./site-config";

// ============================================
// PASSWORD HASHING (Web Crypto — no external deps)
// ============================================

const ITERATIONS = 100_000;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-512" },
    keyMaterial,
    KEY_LENGTH * 8
  );
  const hashArray = new Uint8Array(derivedBits);
  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [saltHex, expectedHashHex] = storedHash.split(":");
  if (!saltHex || !expectedHashHex) return false;

  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-512" },
    keyMaterial,
    KEY_LENGTH * 8
  );
  const hashArray = new Uint8Array(derivedBits);
  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex === expectedHashHex;
}

// ============================================
// SESSION MANAGEMENT
// ============================================

const SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

function getBootstrapAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || siteConfig.contactEmail)
    .trim()
    .toLowerCase();
  const password = (process.env.ADMIN_PASSWORD || "").trim();
  return { email, password };
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = decodeURIComponent(rest.join("="));
  }
  return cookies;
}

export function getSessionCookie(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("Cookie"));
  return cookies[SESSION_COOKIE] || null;
}

export function buildSessionCookie(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    process.env.NODE_ENV === "production" ? "; Secure" : ""
  }`;
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  const result = await sql`
    INSERT INTO admin_sessions (user_id, expires_at)
    VALUES (${userId}, ${expiresAt.toISOString()})
    RETURNING id
  `;
  return result[0].id;
}

export async function getSession(
  request: Request
): Promise<{ id: string; email: string; name: string | null } | null> {
  const sessionId = getSessionCookie(request);
  if (!sessionId) return null;

  const result = await sql`
    SELECT u.id, u.email, u.name
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.user_id
    WHERE s.id = ${sessionId} AND s.expires_at > NOW()
    LIMIT 1
  `;

  if (result.length === 0) return null;
  return result[0] as { id: string; email: string; name: string | null };
}

export async function requireAuth(request: Request) {
  const user = await getSession(request);
  if (!user) {
    throw redirect("/admin/login");
  }
  return user;
}

export async function requireApiAuth(request: Request) {
  const user = await getSession(request);
  if (!user) {
    throw Response.json(
      { success: false, error: "Not authenticated" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return user;
}

export async function destroySession(sessionId: string) {
  await sql`DELETE FROM admin_sessions WHERE id = ${sessionId}`;
}

// ============================================
// ADMIN USER QUERIES
// ============================================

export async function getAdminUserByEmail(email: string) {
  const result = await sql`
    SELECT * FROM admin_users WHERE email = ${email} LIMIT 1
  `;
  return result.length > 0
    ? (result[0] as {
        id: string;
        email: string;
        password_hash: string;
        name: string | null;
      })
    : null;
}

export async function createAdminUser(data: {
  email: string;
  password: string;
  name?: string;
}) {
  const passwordHash = await hashPassword(data.password);
  const result = await sql`
    INSERT INTO admin_users (email, password_hash, name)
    VALUES (${data.email}, ${passwordHash}, ${data.name || null})
    ON CONFLICT (email) DO NOTHING
    RETURNING *
  `;
  return result.length > 0 ? result[0] : null;
}

/**
 * Ensures the bootstrap admin user exists when ADMIN_PASSWORD is configured.
 * This keeps a reliable recovery account available even if profile edits drift.
 */
export async function ensureBootstrapAdminUser() {
  const { email, password } = getBootstrapAdminCredentials();
  if (!password) return;

  const existing = await getAdminUserByEmail(email);
  if (existing) return;

  await createAdminUser({
    email,
    password,
    name: "Admin",
  });

  console.log(`[auth] Created bootstrap admin user: ${email}`);
}

// ============================================
// SEED: ensure at least one admin user exists
// ============================================

export async function ensureAdminUser() {
  const existing = await sql`SELECT id FROM admin_users LIMIT 1`;
  if (existing.length > 0) return;

  const { email, password } = getBootstrapAdminCredentials();
  const seedPassword = password || "changeme123";
  await createAdminUser({
    email,
    password: seedPassword,
    name: "Admin",
  });
  console.log(
    `[auth] Seeded admin user: ${email} (password: ${seedPassword})`
  );
}

/**
 * Break-glass recovery path:
 * If login uses ADMIN_EMAIL + ADMIN_PASSWORD from env, ensure the DB account
 * exists and password hash is synced, then allow login.
 */
export async function recoverAdminLoginWithBootstrapCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string; name: string | null } | null> {
  const {
    email: bootstrapEmail,
    password: bootstrapPassword,
  } = getBootstrapAdminCredentials();

  if (!bootstrapPassword) return null;
  if (email !== bootstrapEmail || password !== bootstrapPassword) return null;

  let user = await getAdminUserByEmail(bootstrapEmail);

  if (!user) {
    await createAdminUser({
      email: bootstrapEmail,
      password: bootstrapPassword,
      name: "Admin",
    });
    user = await getAdminUserByEmail(bootstrapEmail);
  } else {
    const hashMatches = await verifyPassword(bootstrapPassword, user.password_hash);
    if (!hashMatches) {
      await updateAdminPassword(user.id, bootstrapPassword);
      user = await getAdminUserByEmail(bootstrapEmail);
    }
  }

  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name ?? null };
}

// ============================================
// PASSWORD UPDATE
// ============================================

export async function updateAdminPassword(
  userId: string,
  newPassword: string
) {
  const passwordHash = await hashPassword(newPassword);
  await sql`
    UPDATE admin_users SET password_hash = ${passwordHash} WHERE id = ${userId}
  `;
}

export async function updateAdminEmail(
  userId: string,
  newEmail: string
) {
  await sql`
    UPDATE admin_users SET email = ${newEmail} WHERE id = ${userId}
  `;
}

export async function updateAdminName(
  userId: string,
  newName: string
) {
  await sql`
    UPDATE admin_users SET name = ${newName} WHERE id = ${userId}
  `;
}

export async function getAdminUserById(userId: string) {
  const result = await sql`
    SELECT id, email, name, created_at FROM admin_users WHERE id = ${userId} LIMIT 1
  `;
  return result.length > 0
    ? (result[0] as { id: string; email: string; name: string | null; created_at: string })
    : null;
}
