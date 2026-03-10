import { createMediaFolder, findMediaFolderBySlug } from "./queries.server";

const SUBMISSIONS_ROOT_SLUG = "submissions";
const SUBMISSIONS_ROOT_NAME = "Submissions";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Ensures the "Submissions" root folder exists and returns its id.
 * Idempotent — safe to call on every upload.
 */
export async function ensureSubmissionsRoot(): Promise<number> {
  const existing = await findMediaFolderBySlug(SUBMISSIONS_ROOT_SLUG);
  if (existing) return existing.id;

  const folder = await createMediaFolder({
    name: SUBMISSIONS_ROOT_NAME,
    slug: SUBMISSIONS_ROOT_SLUG,
    parent_id: null,
  });
  return (folder as any).id;
}

/**
 * Ensures a subfolder under "Submissions" exists for a specific business.
 * Slug pattern: "submissions-{listing-slug}" (globally unique in media_folders).
 * Display name is just the listing name (e.g., "Zion Lodge").
 * Returns the folder id.
 */
export async function ensureBusinessSubmissionFolder(
  listingName: string,
  listingSlug: string
): Promise<number> {
  const subSlug = `submissions-${slugify(listingSlug)}`;
  const existing = await findMediaFolderBySlug(subSlug);
  if (existing) return existing.id;

  const parentId = await ensureSubmissionsRoot();
  const folder = await createMediaFolder({
    name: listingName,
    slug: subSlug,
    parent_id: parentId,
  });
  return (folder as any).id;
}
