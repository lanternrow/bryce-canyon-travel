import { siteConfig } from "./site-config";

const SITE_URL = siteConfig.siteUrl;

export function getListingPath(type: string, slug: string): string {
  return `/listing/${type}/${slug}`;
}

export function getListingUrl(type: string, slug: string): string {
  return `${SITE_URL}${getListingPath(type, slug)}`;
}
