/**
 * Utilities for applying the global title template from Settings.
 *
 * The root loader fetches all settings (including `title_template` and
 * `site_title`). Every route's `meta()` function receives a `matches`
 * array that includes the root loader data. These helpers extract the
 * template / site name from that data so we don't hardcode "| ZION TRAVEL"
 * anywhere.
 */

import { siteConfig } from "./site-config";

/** Default fallback when no template has been configured */
const DEFAULT_TEMPLATE = "%page_title%";
const DEFAULT_SITE_NAME = siteConfig.siteName;

/**
 * Extract the root settings from a React Router `matches` array.
 */
function getRootSettings(matches: unknown): Record<string, string> {
  if (!Array.isArray(matches)) return {};
  const root = matches.find((m: any) => m.id === "root");
  return (root?.data?.settings as Record<string, string>) || {};
}

/**
 * Apply the global title template to a page title.
 *
 * The template stored in settings uses `%page_title%` as a placeholder.
 * Example templates:
 *   "%page_title% | ZION TRAVEL"
 *   "%page_title% — Zion Travel"
 *   "%page_title%"
 */
export function formatPageTitle(pageTitle: string, matches: unknown): string {
  const settings = getRootSettings(matches);
  const template = settings.title_template || DEFAULT_TEMPLATE;
  return template.replace("%page_title%", pageTitle);
}

/**
 * Get the site name for og:site_name and similar tags.
 */
export function getSiteName(matches: unknown): string {
  const settings = getRootSettings(matches);
  return settings.site_title || DEFAULT_SITE_NAME;
}

/**
 * Client-side helper: apply a title template string directly.
 * Used in admin editors where the template is available from useRouteLoaderData.
 */
export function applyTitleTemplate(pageTitle: string, template: string): string {
  if (!template) return pageTitle;
  return template.replace("%page_title%", pageTitle);
}
