// Unified SEO notification — pings Google (sitemap resubmit), Bing (IndexNow + URL batch)
// All calls are fire-and-forget; errors are logged, never thrown.

import { submitSitemap } from "./search-console.server";
import { notifyIndexNow } from "./indexnow.server";
import { submitBingUrlBatch } from "./bing-webmaster.server";
import { getSettings } from "./queries.server";
import { hasGoogleCredentials } from "./google-auth.server";
import { siteConfig } from "./site-config";

type NotifyTaskResult = {
  attempted: boolean;
  success: boolean;
  error?: string;
};

export type SearchEngineNotifyResult = {
  siteUrl: string;
  changedUrls: string[];
  google: {
    enabled: boolean;
    listingsSitemap: NotifyTaskResult;
    postsSitemap: NotifyTaskResult;
  };
  indexNow: NotifyTaskResult;
  bing: NotifyTaskResult;
};

function skippedTask(): NotifyTaskResult {
  return { attempted: false, success: false };
}

async function runTask(
  promiseFactory: () => Promise<unknown>,
): Promise<NotifyTaskResult> {
  try {
    await promiseFactory();
    return { attempted: true, success: true };
  } catch (error) {
    return {
      attempted: true,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Notify search engines about a URL change.
 * Called after publishing/updating a listing or blog post.
 *
 * This function is designed to be called fire-and-forget:
 *   notifySearchEngines([url]).catch(console.error);
 */
export async function notifySearchEngines(
  changedUrls: string[]
): Promise<void> {
  await notifySearchEnginesDetailed(changedUrls);
}

export async function notifySearchEnginesDetailed(
  changedUrls: string[],
): Promise<SearchEngineNotifyResult> {
  const settings = await getSettings();
  const siteUrl = (settings.gsc_site_url || siteConfig.siteUrl).replace(
    /\/$/,
    ""
  );

  const result: SearchEngineNotifyResult = {
    siteUrl,
    changedUrls,
    google: {
      enabled: hasGoogleCredentials(),
      listingsSitemap: skippedTask(),
      postsSitemap: skippedTask(),
    },
    indexNow: skippedTask(),
    bing: skippedTask(),
  };

  // Google: resubmit the relevant sub-sitemap
  if (result.google.enabled) {
    const hasListing = changedUrls.some((u) => u.includes("/listing/"));
    const hasPost = changedUrls.some((u) => !u.includes("/listing/"));

    if (hasListing) {
      result.google.listingsSitemap = await runTask(() =>
        submitSitemap(siteUrl, `${siteUrl}/sitemap-listings.xml`).then(
          (response) => {
            if (!response.success) {
              throw new Error(response.error || "Unknown Google sitemap error");
            }
          },
        ),
      );
    }
    if (hasPost) {
      result.google.postsSitemap = await runTask(() =>
        submitSitemap(siteUrl, `${siteUrl}/sitemap-posts.xml`).then(
          (response) => {
            if (!response.success) {
              throw new Error(response.error || "Unknown Google sitemap error");
            }
          },
        ),
      );
    }
  }

  // IndexNow (Bing, Yandex)
  if (settings.indexnow_api_key) {
    result.indexNow = await runTask(() =>
      notifyIndexNow(changedUrls).then((response) => {
        if (!response.success) {
          throw new Error(response.error || "Unknown IndexNow error");
        }
      }),
    );
  }

  // Bing URL batch submission (belt-and-suspenders with IndexNow)
  if (settings.bing_api_key) {
    result.bing = await runTask(() =>
      submitBingUrlBatch(siteUrl, changedUrls).then((response) => {
        if (!response.success) {
          throw new Error(response.error || "Unknown Bing batch error");
        }
      }),
    );
  }

  if (result.google.listingsSitemap.attempted && !result.google.listingsSitemap.success) {
    console.error("[SEO] GSC listings sitemap submit failed:", result.google.listingsSitemap.error);
  }
  if (result.google.postsSitemap.attempted && !result.google.postsSitemap.success) {
    console.error("[SEO] GSC posts sitemap submit failed:", result.google.postsSitemap.error);
  }
  if (result.indexNow.attempted && !result.indexNow.success) {
    console.error("[SEO] IndexNow notify failed:", result.indexNow.error);
  }
  if (result.bing.attempted && !result.bing.success) {
    console.error("[SEO] Bing URL batch submit failed:", result.bing.error);
  }

  return result;
}
