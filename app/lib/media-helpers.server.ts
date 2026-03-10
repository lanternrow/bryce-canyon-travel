import { getMediaByUrls } from "./queries.server";

/**
 * Given an array of image URLs (some may be null/undefined),
 * batch-fetches their media records and returns a plain object
 * mapping URL → { alt_text, title, caption } for use in loaders.
 *
 * Returns a serializable record (not a Map) so it can be passed
 * directly from loader to component.
 */
export async function buildMediaMetadata(
  urls: (string | null | undefined)[]
): Promise<Record<string, { alt_text?: string; title?: string; caption?: string }>> {
  const validUrls = urls.filter((u): u is string => !!u);
  if (validUrls.length === 0) return {};

  const records = await getMediaByUrls(validUrls);
  const metadata: Record<string, { alt_text?: string; title?: string; caption?: string }> = {};

  for (const m of records as any[]) {
    metadata[m.url] = {
      alt_text: m.alt_text || undefined,
      title: m.title || undefined,
      caption: m.caption || undefined,
    };
  }

  return metadata;
}
