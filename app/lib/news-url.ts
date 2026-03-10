import { siteConfig } from "./site-config";

const SITE_URL = siteConfig.siteUrl;

export function getNewsArticlePath(slug: string): string {
  return `/news/${slug}`;
}

export function getNewsCategoryPath(categorySlug: string): string {
  return `/news/category/${categorySlug}`;
}

export function getNewsArticleUrl(slug: string): string {
  return `${SITE_URL}${getNewsArticlePath(slug)}`;
}

export function getNewsCategoryUrl(categorySlug: string): string {
  return `${SITE_URL}${getNewsCategoryPath(categorySlug)}`;
}
