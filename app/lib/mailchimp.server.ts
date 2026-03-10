// ============================================
// MAILCHIMP MARKETING API v3 — Server-side only
// Direct REST calls, no npm dependency.
// Follows the same pattern as google-places.server.ts
// and claude-ai.server.ts: read credentials from
// settings, fall back to environment variables.
// ============================================

import { createHash } from "crypto";
import { getSettings } from "./queries.server";

interface MailchimpConfig {
  apiKey: string;
  serverPrefix: string; // e.g., "us2"
  audienceId: string;
}

/**
 * Get Mailchimp configuration from admin settings, falling back to env vars.
 * Returns null if not configured.
 */
async function getMailchimpConfig(): Promise<MailchimpConfig | null> {
  let apiKey: string | null = null;
  let serverPrefix: string | null = null;
  let audienceId: string | null = null;

  try {
    const settings = await getSettings();
    apiKey = settings.mailchimp_api_key || null;
    serverPrefix = settings.mailchimp_server_prefix || null;
    audienceId = settings.mailchimp_audience_id || null;
  } catch {
    // Fall through to env vars
  }

  apiKey = apiKey || process.env.MAILCHIMP_API_KEY || null;
  serverPrefix = serverPrefix || process.env.MAILCHIMP_SERVER_PREFIX || null;
  audienceId = audienceId || process.env.MAILCHIMP_AUDIENCE_ID || null;

  // Auto-extract server prefix from API key if not set (key format: xxxxx-us2)
  if (apiKey && !serverPrefix) {
    const parts = apiKey.split("-");
    if (parts.length === 2) serverPrefix = parts[1];
  }

  if (!apiKey || !serverPrefix || !audienceId) return null;
  return { apiKey, serverPrefix, audienceId };
}

/**
 * MD5 hash for Mailchimp subscriber hash (required by their API).
 */
function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export interface SubscribeResult {
  success: boolean;
  status: "subscribed" | "pending" | "already_subscribed" | "error";
  message: string;
}

/**
 * Subscribe an email to the configured Mailchimp audience.
 *
 * Uses PUT to /lists/{id}/members/{hash} (upsert pattern) so
 * re-subscribes are idempotent and don't fail on existing members.
 * status_if_new: "pending" triggers Mailchimp's double opt-in flow.
 */
export async function addSubscriber(
  email: string,
  options?: { firstName?: string; lastName?: string; tags?: string[] }
): Promise<SubscribeResult> {
  const config = await getMailchimpConfig();
  if (!config) {
    return { success: false, status: "error", message: "Newsletter service not configured." };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const emailHash = md5(normalizedEmail);
  const url = `https://${config.serverPrefix}.api.mailchimp.com/3.0/lists/${config.audienceId}/members/${emailHash}`;

  const body: Record<string, unknown> = {
    email_address: normalizedEmail,
    status_if_new: "pending", // double opt-in
  };

  if (options?.firstName || options?.lastName) {
    body.merge_fields = {
      ...(options.firstName ? { FNAME: options.firstName } : {}),
      ...(options.lastName ? { LNAME: options.lastName } : {}),
    };
  }

  if (options?.tags && options.tags.length > 0) {
    body.tags = options.tags;
  }

  const auth = `Basic ${Buffer.from(`anystring:${config.apiKey}`).toString("base64")}`;

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.status === "subscribed") {
        return { success: true, status: "already_subscribed", message: "You're already subscribed!" };
      }
      // "pending" means confirmation email sent
      return { success: true, status: "pending", message: "Check your email to confirm your subscription." };
    }

    const errorData = await res.json().catch(() => null);
    const errorTitle = errorData?.title || "Unknown error";
    console.error("[Mailchimp] Subscribe error:", res.status, errorTitle, errorData?.detail);

    if (res.status === 400 && errorTitle === "Member Exists") {
      return { success: true, status: "already_subscribed", message: "You're already subscribed!" };
    }

    return { success: false, status: "error", message: "Subscription failed. Please try again." };
  } catch (err) {
    console.error("[Mailchimp] Network error:", err);
    return { success: false, status: "error", message: "Network error. Please try again." };
  }
}
