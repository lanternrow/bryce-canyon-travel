// IndexNow — instant URL notification for Bing, Yandex, and other search engines
// Protocol: https://www.indexnow.org/

import { getSettings } from "./queries.server";
import { siteConfig } from "./site-config";

/**
 * Notify IndexNow-compatible search engines about URL changes.
 * Supports Bing, Yandex, Seznam, and others.
 */
export async function notifyIndexNow(
  urls: string[]
): Promise<{ success: boolean; error?: string }> {
  const settings = await getSettings();
  const apiKey = settings.indexnow_api_key;
  if (!apiKey) {
    return { success: false, error: "IndexNow API key not configured" };
  }

  const host = new URL(siteConfig.siteUrl).hostname;

  try {
    const response = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: apiKey,
        keyLocation: `https://${host}/${apiKey}.txt`,
        urlList: urls,
      }),
    });

    // IndexNow returns 200 or 202 on success
    if (response.ok || response.status === 202) {
      return { success: true };
    }

    return {
      success: false,
      error: `IndexNow returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
