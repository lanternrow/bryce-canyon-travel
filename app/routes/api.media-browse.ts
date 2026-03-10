import { getMedia, getMediaFolders, getMediaFolderTree } from "../lib/queries.server";
import { requireApiAuth } from "../lib/auth.server";

/**
 * GET /api/media-browse
 * Returns media items, flat folders (backward-compatible), and folder tree for the media picker modal.
 *
 * Query params:
 *   q      — search term (filename, alt_text, title)
 *   folder — folder ID (number) or "unfiled"
 *   limit  — max items (default 60)
 */
export async function loader({ request }: { request: Request }) {
  await requireApiAuth(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const folderParam = url.searchParams.get("folder");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "60", 10), 200);

  const folderId =
    folderParam === "unfiled"
      ? ("unfiled" as const)
      : folderParam
        ? Number(folderParam)
        : null;

  const [media, folders, folderTreeData] = await Promise.all([
    getMedia({ limit, search, folderId }),
    getMediaFolders(),
    getMediaFolderTree(),
  ]);

  return Response.json({
    media,
    folders,
    folderTree: folderTreeData.tree,
    totalCount: folderTreeData.totalCount,
    unfiledCount: folderTreeData.unfiledCount,
  });
}
