import type { Route } from "./+types/api.debug-media";
import { requireAuth } from "../lib/auth.server";
import { getMedia, getMediaFolderTree, getMediaUsageCounts } from "../lib/queries.server";
import { isR2Configured } from "../lib/storage.server";

export async function loader({ request }: Route.LoaderArgs) {
  try {
    await requireAuth(request);
  } catch (e) {
    return Response.json({ error: "Auth failed", detail: String(e) }, { status: 401 });
  }

  const steps: Record<string, any> = {};

  try {
    steps.step1 = "getMedia...";
    const media = await getMedia({ limit: 100, search: "", folderId: null });
    steps.step1 = `OK (${(media as any[]).length} items)`;

    steps.step2 = "getMediaFolderTree...";
    const folderTree = await getMediaFolderTree();
    steps.step2 = `OK (${folderTree.tree.length} folders, ${folderTree.totalCount} total)`;

    steps.step3 = "getMediaUsageCounts...";
    const urls = (media as any[]).map((m: any) => m.url).filter(Boolean);
    const usageCounts = await getMediaUsageCounts(urls);
    steps.step3 = `OK (${Object.keys(usageCounts).length} usage entries)`;

    steps.step4 = "isR2Configured...";
    const r2Ready = isR2Configured();
    steps.step4 = `OK (r2Ready=${r2Ready})`;

    return Response.json({
      success: true,
      steps,
      loaderData: {
        mediaCount: (media as any[]).length,
        folderTreeKeys: Object.keys(folderTree),
        r2Ready,
        usageCountsKeys: Object.keys(usageCounts).length,
      },
    });
  } catch (e: any) {
    return Response.json({
      success: false,
      steps,
      error: e.message,
      stack: e.stack,
    }, { status: 500 });
  }
}
