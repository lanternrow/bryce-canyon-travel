import { Link, useLoaderData, Form, redirect, useNavigation, useSearchParams, useFetcher } from "react-router";
import type { Route } from "./+types/admin-media";
import { useRef, useState, useEffect, useCallback } from "react";
import { requireAuth } from "../lib/auth.server";
import {
  getMedia,
  deleteMedia,
  createMedia,
  updateMedia,
  getMediaFolderTree,
  createMediaFolder,
  renameMediaFolder,
  deleteMediaFolder,
  moveMediaToFolder,
  getMediaUsageCounts,
  getMediaUsage,
  deleteMediaUsageByUrl,
} from "../lib/queries.server";
import type { MediaFolderTreeNode } from "../lib/queries.server";
import { uploadToR2, deleteFromR2, isR2Configured } from "../lib/storage.server";
import { formatShortDate } from "../lib/format";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Media Library | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const url = new URL(request.url);
  const search = url.searchParams.get("q") || "";
  const folderParam = url.searchParams.get("folder");

  const folderId =
    folderParam === "unfiled"
      ? ("unfiled" as const)
      : folderParam
        ? Number(folderParam)
        : null;

  const [media, folderTree] = await Promise.all([
    getMedia({ limit: 100, search, folderId }),
    getMediaFolderTree(),
  ]);

  const urls = (media as any[]).map((m: any) => m.url).filter(Boolean);
  const usageCounts = await getMediaUsageCounts(urls);

  const r2Ready = isR2Configured();
  return { media, folderTree, r2Ready, search, usageCounts, currentFolder: folderParam };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "delete") {
    const id = formData.get("id") as string;
    const url = formData.get("url") as string;
    if (isR2Configured() && url) {
      try {
        await deleteFromR2(url);
      } catch (e) {
        console.error("R2 delete error:", e);
      }
    }
    if (url) await deleteMediaUsageByUrl(url);
    await deleteMedia(id);
    return { ok: true, deleted: true };
  }

  if (intent === "update") {
    const id = formData.get("id") as string;
    const filename = (formData.get("filename") as string) || undefined;
    const alt_text = (formData.get("alt_text") as string) || "";
    const title = (formData.get("title") as string) || "";
    const caption = (formData.get("caption") as string) || "";
    const description = (formData.get("description") as string) || "";
    const folder_id = formData.get("folder_id")
      ? Number(formData.get("folder_id"))
      : null;
    await updateMedia(id, { filename, alt_text, title, caption, description, folder_id });
    return { ok: true, updated: true };
  }

  if (intent === "upload") {
    const files = formData.getAll("files") as File[];
    const rawTargetFolder = String(formData.get("target_folder_id") || "").trim();
    const uploadFolderId =
      rawTargetFolder &&
      rawTargetFolder !== "unfiled" &&
      Number.isFinite(Number(rawTargetFolder))
        ? Number(rawTargetFolder)
        : null;
    const returnFolder = String(formData.get("return_folder") || "").trim();
    const returnSearch = String(formData.get("return_search") || "").trim();
    let uploaded = 0;

    for (const file of files) {
      if (!file || file.size === 0) continue;

      if (isR2Configured()) {
        const result = await uploadToR2(file);
        const autoTitle = result.filename
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        await createMedia({
          filename: result.filename,
          url: result.url,
          mime_type: result.mimeType,
          size_bytes: result.size,
          title: autoTitle,
          folder_id: uploadFolderId,
        });
      } else {
        await createMedia({
          filename: file.name,
          url: `/placeholder/${file.name}`,
          mime_type: file.type,
          size_bytes: file.size,
          folder_id: uploadFolderId,
        });
      }
      uploaded++;
    }

    const params = new URLSearchParams();
    if (returnSearch) params.set("q", returnSearch);
    if (returnFolder) params.set("folder", returnFolder);
    params.set("toast", `${uploaded}+file${uploaded !== 1 ? "s" : ""}+uploaded`);

    return redirect(`/admin/media?${params.toString()}`);
  }

  // ── Folder management ──

  if (intent === "create-folder") {
    const name = (formData.get("folder_name") as string).trim();
    const parentId = formData.get("parent_id") ? Number(formData.get("parent_id")) : null;
    if (name) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await createMediaFolder({ name, slug, parent_id: parentId });
    }
    return { ok: true, folderCreated: true };
  }

  if (intent === "rename-folder") {
    const id = Number(formData.get("folder_id"));
    const name = (formData.get("folder_name") as string).trim();
    if (name && id) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await renameMediaFolder(id, name, slug);
    }
    return { ok: true, folderRenamed: true };
  }

  if (intent === "delete-folder") {
    const id = Number(formData.get("folder_id"));
    if (id) await deleteMediaFolder(id);
    return { ok: true, folderDeleted: true };
  }

  // ── Move media to folder (drag-and-drop) ──

  if (intent === "move-to-folder") {
    const mediaIds = JSON.parse((formData.get("media_ids") as string) || "[]");
    const targetFolderId = formData.get("target_folder_id")
      ? Number(formData.get("target_folder_id"))
      : null;
    await moveMediaToFolder(mediaIds, targetFolderId);
    return { ok: true, moved: true };
  }

  // ── Usage lookup (for edit panel) ──

  if (intent === "get-usage") {
    const url = formData.get("url") as string;
    const usage = url ? await getMediaUsage(url) : [];
    return { ok: true, usage };
  }

  return redirect("/admin/media");
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "\u2014";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type MediaGridColumns = 3 | 4 | 5 | 6;

const MEDIA_GRID_LAYOUT: Record<
  MediaGridColumns,
  {
    gridClass: string;
    thumbClass: string;
    gapClass: string;
  }
> = {
  3: {
    gridClass: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    thumbClass: "h-[200px]",
    gapClass: "gap-6",
  },
  4: {
    gridClass: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
    thumbClass: "h-[180px]",
    gapClass: "gap-5",
  },
  5: {
    gridClass: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
    thumbClass: "h-[160px]",
    gapClass: "gap-4",
  },
  6: {
    gridClass: "grid-cols-2 sm:grid-cols-4 lg:grid-cols-6",
    thumbClass: "h-[140px]",
    gapClass: "gap-4",
  },
};

function getGradient(filename: string) {
  const gradients = [
    "from-sage to-sand",
    "from-primary to-sand",
    "from-sky-400 to-sage",
    "from-orange-400 to-primary",
    "from-emerald-500 to-sage",
    "from-sand to-amber-400",
    "from-rose-400 to-sand",
    "from-dark to-gray-500",
  ];
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = filename.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

// ============================================
// Folder Tree Node (recursive)
// ============================================

function FolderTreeNodeItem({
  node,
  currentFolder,
  search,
  expandedIds,
  toggleExpand,
  onRename,
  onDelete,
  onCreateSub,
  dragOverId,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  depth,
}: {
  node: MediaFolderTreeNode;
  currentFolder: string | null;
  search: string;
  expandedIds: Set<number>;
  toggleExpand: (id: number) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number, name: string) => void;
  onCreateSub: (parentId: number) => void;
  dragOverId: number | "unfiled" | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent, id: number) => void;
  onDragLeave: (e: React.DragEvent, id: number) => void;
  onDrop: (e: React.DragEvent, id: number) => void;
  depth: number;
}) {
  const isActive = currentFolder === String(node.id);
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isDragTarget = dragOverId === node.id;

  const folderLink = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("folder", String(node.id));
    const qs = params.toString();
    return `/admin/media${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <div
        className={`group flex items-center gap-1 py-1 pr-2 rounded-md text-sm transition-colors ${
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : isDragTarget
              ? "ring-2 ring-primary bg-primary/5"
              : "text-gray-700 hover:bg-gray-100"
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onDragOver={onDragOver}
        onDragEnter={(e) => onDragEnter(e, node.id)}
        onDragLeave={(e) => onDragLeave(e, node.id)}
        onDrop={(e) => onDrop(e, node.id)}
      >
        {/* Expand/collapse chevron */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleExpand(node.id);
          }}
          className={`w-4 h-4 flex items-center justify-center flex-shrink-0 ${
            hasChildren ? "text-gray-400 hover:text-gray-600" : "invisible"
          }`}
        >
          <svg
            className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Folder icon */}
        <svg className="w-4 h-4 flex-shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>

        {/* Folder name link */}
        <Link
          to={folderLink()}
          className="flex-1 truncate"
        >
          {node.name}
        </Link>

        {/* Count */}
        <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
          {node.total_count}
        </span>

        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-0.5 flex-shrink-0 ml-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateSub(node.id);
            }}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-primary rounded"
            title="New subfolder"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRename(node.id, node.name);
            }}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded"
            title="Rename"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id, node.name);
            }}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 rounded"
            title="Delete"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeNodeItem
              key={child.id}
              node={child}
              currentFolder={currentFolder}
              search={search}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              onRename={onRename}
              onDelete={onDelete}
              onCreateSub={onCreateSub}
              dragOverId={dragOverId}
              onDragOver={onDragOver}
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Folder Tree Sidebar
// ============================================

function FolderTreeSidebar({
  tree,
  totalCount,
  unfiledCount,
  currentFolder,
  search,
  dragOverId,
  onDragOver,
  onDragEnterFolder,
  onDragLeaveFolder,
  onDropFolder,
}: {
  tree: MediaFolderTreeNode[];
  totalCount: number;
  unfiledCount: number;
  currentFolder: string | null;
  search: string;
  dragOverId: number | "unfiled" | null;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnterFolder: (e: React.DragEvent, id: number | "unfiled") => void;
  onDragLeaveFolder: (e: React.DragEvent, id: number | "unfiled") => void;
  onDropFolder: (e: React.DragEvent, id: number | null) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => {
    // Auto-expand folders that contain the current selection
    const ids = new Set<number>();
    if (currentFolder && currentFolder !== "unfiled") {
      const folderId = Number(currentFolder);
      // Find ancestors to expand
      function findPath(nodes: MediaFolderTreeNode[]): boolean {
        for (const node of nodes) {
          if (node.id === folderId) return true;
          if (node.children.length > 0 && findPath(node.children)) {
            ids.add(node.id);
            return true;
          }
        }
        return false;
      }
      findPath(tree);
    }
    return ids;
  });

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState<number | null | "root">(null);
  const [newFolderName, setNewFolderName] = useState("");
  const folderFetcher = useFetcher();

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRename = (id: number, name: string) => {
    setRenamingId(id);
    setRenameValue(name);
  };

  const submitRename = () => {
    if (!renamingId || !renameValue.trim()) return;
    folderFetcher.submit(
      { intent: "rename-folder", folder_id: String(renamingId), folder_name: renameValue.trim() },
      { method: "post" }
    );
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDelete = (id: number, name: string) => {
    if (!confirm(`Delete folder "${name}"? Images will become unfiled, subfolders will be reparented.`)) return;
    folderFetcher.submit(
      { intent: "delete-folder", folder_id: String(id) },
      { method: "post" }
    );
  };

  const handleCreateSub = (parentId: number) => {
    setNewFolderParentId(parentId);
    setNewFolderName("");
    // Auto-expand the parent
    setExpandedIds((prev) => new Set([...prev, parentId]));
  };

  const submitNewFolder = () => {
    if (!newFolderName.trim()) return;
    const data: Record<string, string> = {
      intent: "create-folder",
      folder_name: newFolderName.trim(),
    };
    if (newFolderParentId !== null && newFolderParentId !== "root") {
      data.parent_id = String(newFolderParentId);
    }
    folderFetcher.submit(data, { method: "post" });
    setNewFolderParentId(null);
    setNewFolderName("");
  };

  const allLink = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    const qs = params.toString();
    return `/admin/media${qs ? `?${qs}` : ""}`;
  };

  const unfiledLink = () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("folder", "unfiled");
    const qs = params.toString();
    return `/admin/media${qs ? `?${qs}` : ""}`;
  };

  return (
    <aside className="w-[260px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Folders</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {/* All Media */}
        <Link
          to={allLink()}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
            !currentFolder
              ? "bg-primary/10 text-primary font-medium"
              : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
          </svg>
          <span className="flex-1">All Media</span>
          <span className="text-xs text-gray-400 tabular-nums">{totalCount}</span>
        </Link>

        {/* Unfiled */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
            currentFolder === "unfiled"
              ? "bg-primary/10 text-primary font-medium"
              : dragOverId === "unfiled"
                ? "ring-2 ring-primary bg-primary/5"
                : "text-gray-700 hover:bg-gray-100"
          }`}
          onDragOver={onDragOver}
          onDragEnter={(e) => onDragEnterFolder(e, "unfiled")}
          onDragLeave={(e) => onDragLeaveFolder(e, "unfiled")}
          onDrop={(e) => onDropFolder(e, null)}
        >
          <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
          </svg>
          <Link to={unfiledLink()} className="flex-1">Unfiled</Link>
          <span className="text-xs text-gray-400 tabular-nums">{unfiledCount}</span>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 my-2" />

        {/* Rename inline form */}
        {renamingId !== null && (
          <div className="px-3 py-1.5">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setRenamingId(null);
              }}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-primary"
              autoFocus
            />
            <div className="flex items-center gap-1 mt-1">
              <button
                type="button"
                onClick={submitRename}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setRenamingId(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Folder tree */}
        {tree.map((node) => (
          <FolderTreeNodeItem
            key={node.id}
            node={node}
            currentFolder={currentFolder}
            search={search}
            expandedIds={expandedIds}
            toggleExpand={toggleExpand}
            onRename={handleRename}
            onDelete={handleDelete}
            onCreateSub={handleCreateSub}
            dragOverId={dragOverId}
            onDragOver={onDragOver}
            onDragEnter={(e, id) => onDragEnterFolder(e, id)}
            onDragLeave={(e, id) => onDragLeaveFolder(e, id)}
            onDrop={(e, id) => onDropFolder(e, id)}
            depth={0}
          />
        ))}

        {/* New subfolder inline form (when creating under a parent) */}
        {newFolderParentId !== null && newFolderParentId !== "root" && (
          <div className="px-3 py-1.5" style={{ paddingLeft: `${20}px` }}>
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitNewFolder();
                  if (e.key === "Escape") {
                    setNewFolderParentId(null);
                    setNewFolderName("");
                  }
                }}
                className="flex-1 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:border-primary"
                placeholder="Subfolder name..."
                autoFocus
              />
            </div>
            <div className="flex items-center gap-1 mt-1 ml-4">
              <button
                type="button"
                onClick={submitNewFolder}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewFolderParentId(null);
                  setNewFolderName("");
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom: new folder button / inline form */}
      <div className="px-3 py-3 border-t border-gray-100">
        {newFolderParentId === "root" ? (
          <div>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewFolder();
                if (e.key === "Escape") {
                  setNewFolderParentId(null);
                  setNewFolderName("");
                }
              }}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
              placeholder="Folder name..."
              autoFocus
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                type="button"
                onClick={submitNewFolder}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewFolderParentId(null);
                  setNewFolderName("");
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNewFolderParentId("root")}
            className="w-full px-3 py-1.5 text-xs font-medium text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-primary hover:text-primary transition-colors inline-flex items-center justify-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Folder
          </button>
        )}
      </div>
    </aside>
  );
}

// ============================================
// Render indented folder options (for edit panel select)
// ============================================

function renderFolderOptions(nodes: MediaFolderTreeNode[], depth: number = 0): React.ReactNode[] {
  const options: React.ReactNode[] = [];
  for (const node of nodes) {
    const prefix = "\u00A0\u00A0".repeat(depth);
    options.push(
      <option key={node.id} value={node.id}>
        {prefix}{depth > 0 ? "\u2514\u00A0" : ""}{node.name}
      </option>
    );
    if (node.children.length > 0) {
      options.push(...renderFolderOptions(node.children, depth + 1));
    }
  }
  return options;
}

// ============================================
// Edit Panel (slide-over)
// ============================================

function EditPanel({
  item,
  folderTree,
  onClose,
}: {
  item: any;
  folderTree: MediaFolderTreeNode[];
  onClose: () => void;
}) {
  const fetcher = useFetcher();
  const usageFetcher = useFetcher();
  const [filename, setFilename] = useState(item.filename || "");
  const [altText, setAltText] = useState(item.alt_text || "");
  const [title, setTitle] = useState(item.title || "");
  const [caption, setCaption] = useState(item.caption || "");
  const [description, setDescription] = useState(item.description || "");
  const [folderId, setFolderId] = useState<string>(
    item.folder_id ? String(item.folder_id) : ""
  );
  const [showSaved, setShowSaved] = useState(false);
  const [aiLoadingField, setAiLoadingField] = useState<string | null>(null);

  const isSaving = fetcher.state !== "idle";

  // Detect save completion
  const prevState = useRef(fetcher.state);
  if (prevState.current === "submitting" && fetcher.state === "idle") {
    if (!showSaved) {
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 2000);
    }
  }
  prevState.current = fetcher.state;

  // Lazy-load usage data when panel opens
  useEffect(() => {
    if (item.url) {
      usageFetcher.submit(
        { intent: "get-usage", url: item.url },
        { method: "post" }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.url]);

  const usageRecords = (usageFetcher.data as any)?.usage || [];

  const handleSave = () => {
    fetcher.submit(
      {
        intent: "update",
        id: item.id,
        filename,
        alt_text: altText,
        title,
        caption,
        description,
        folder_id: folderId,
      },
      { method: "post" }
    );
  };

  const handleDelete = () => {
    if (!confirm("Delete this file permanently?")) return;
    fetcher.submit(
      { intent: "delete", id: item.id, url: item.url || "" },
      { method: "post" }
    );
    onClose();
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(item.url);
  };

  const handleAiGenerate = async (field: "filename" | "alt") => {
    if (!item.url || item.url.startsWith("/placeholder")) return;
    setAiLoadingField(field);
    try {
      const res = await fetch("/api/ai-image-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: item.url,
          currentFilename: filename,
          field,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        if (field === "filename" && data.filename) setFilename(data.filename);
        if (field === "alt" && data.altText) setAltText(data.altText);
      }
    } catch {
      alert("AI generation failed. Please try again.");
    } finally {
      setAiLoadingField(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-white z-50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-dark">Image Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            &#10005;
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Preview */}
          {item.url && !item.url.startsWith("/placeholder") ? (
            <img
              src={item.url}
              alt={altText || item.filename}
              className="w-full h-48 object-contain rounded-lg border border-gray-200 checkerboard"
            />
          ) : (
            <div
              className={`w-full h-48 bg-gradient-to-br ${getGradient(item.filename)} rounded-lg flex items-center justify-center`}
            >
              <span className="text-white/80 text-sm font-medium">{item.filename}</span>
            </div>
          )}

          {/* Filename (editable for SEO) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-500">Filename</label>
              {item.url && !item.url.startsWith("/placeholder") && (
                <button
                  type="button"
                  onClick={() => handleAiGenerate("filename")}
                  disabled={aiLoadingField === "filename"}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
                  title="AI-generate SEO filename"
                >
                  {aiLoadingField === "filename" ? (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                  )}
                  AI Generate
                </button>
              )}
            </div>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              placeholder="keyword-optimized-filename.jpg"
            />
            <p className="text-xs text-gray-400 mt-1">
              Override with a keyword-rich name for SEO (e.g. zion-angels-landing-sunrise.jpg).
            </p>
          </div>

          {/* File info (read-only) */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Type</span>
              <span className="text-gray-700">{item.mime_type || "\u2014"}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Size</span>
              <span className="text-gray-700">{formatBytes(item.size_bytes)}</span>
            </div>
            {item.width && item.height && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Dimensions</span>
                <span className="text-gray-700">{item.width} &times; {item.height}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Uploaded</span>
              <span className="text-gray-700">{formatShortDate(item.uploaded_at)}</span>
            </div>
          </div>

          {/* Usage information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Used In</h3>
            {usageFetcher.state !== "idle" ? (
              <p className="text-xs text-gray-400">Loading...</p>
            ) : usageRecords.length === 0 ? (
              <p className="text-xs text-gray-400">Not currently used on any page</p>
            ) : (
              <ul className="space-y-1.5">
                {usageRecords.map((u: any, i: number) => (
                  <li key={i} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 font-medium truncate mr-2">
                      {u.entity_name || u.entity_id}
                    </span>
                    <span className="text-gray-400 capitalize flex-shrink-0">
                      {u.usage_type.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* URL (copy) */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">URL</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={item.url || ""}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 bg-gray-50"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
                title="Copy URL"
              >
                Copy
              </button>
            </div>
          </div>

          {/* Folder assignment (indented tree dropdown) */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Folder</label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:border-primary"
            >
              <option value="">Unfiled</option>
              {renderFolderOptions(folderTree)}
            </select>
          </div>

          {/* Editable fields */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              placeholder="Image title..."
            />
            <p className="text-xs text-gray-400 mt-1">Shown as tooltip on hover. Used for internal reference.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-500">
                Alt Text <span className="text-primary">*</span>
              </label>
              {item.url && !item.url.startsWith("/placeholder") && (
                <button
                  type="button"
                  onClick={() => handleAiGenerate("alt")}
                  disabled={aiLoadingField === "alt"}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
                  title="AI-generate SEO alt text"
                >
                  {aiLoadingField === "alt" ? (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                  )}
                  AI Generate
                </button>
              )}
            </div>
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              placeholder="Describe this image for search engines and screen readers..."
            />
            <p className="text-xs text-gray-400 mt-1">
              Critical for SEO and accessibility. Describes the image content.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Caption</label>
            <textarea
              rows={2}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              placeholder="Optional caption displayed below the image..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              placeholder="Internal notes or long description..."
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="text-sm text-red-500 hover:underline"
          >
            Delete permanently
          </button>
          <div className="flex items-center gap-3">
            {showSaved && (
              <span className="text-xs text-emerald-600 font-medium">Saved!</span>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={`px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors ${
                isSaving ? "opacity-50 cursor-wait" : ""
              }`}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================
// Main Component
// ============================================

export default function AdminMedia() {
  const { media, folderTree, r2Ready, search, usageCounts, currentFolder } =
    useLoaderData<typeof loader>();
  const items = media as any[];
  const { tree, totalCount, unfiledCount } = folderTree as {
    tree: MediaFolderTreeNode[];
    flatFolders: any[];
    totalCount: number;
    unfiledCount: number;
  };
  const navigation = useNavigation();
  const isUploading = navigation.state === "submitting";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const moveFetcher = useFetcher();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [gridColumns, setGridColumns] = useState<MediaGridColumns>(3);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rangeAnchorIndex, setRangeAnchorIndex] = useState<number | null>(null);

  // ── Drag-and-drop state ──
  const [dragOverId, setDragOverId] = useState<number | "unfiled" | null>(null);
  const dragCounterRef = useRef<Map<number | "unfiled", number>>(new Map());

  const editingItem = editingId ? items.find((i) => i.id === editingId) : null;
  const gridLayout = MEDIA_GRID_LAYOUT[gridColumns];

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = Number(window.localStorage.getItem("admin-media-grid-columns"));
    if (raw === 3 || raw === 4 || raw === 5 || raw === 6) {
      setGridColumns(raw);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("admin-media-grid-columns", String(gridColumns));
  }, [gridColumns]);

  useEffect(() => {
    // Keep only selections still visible in current filtered view.
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(items.map((item: any) => String(item.id)));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedIds(new Set());
        setRangeAnchorIndex(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleFileChange = () => {
    if (fileInputRef.current?.files?.length && formRef.current) {
      formRef.current.requestSubmit();
    }
  };

  // ── Drag handlers for grid items ──
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    const orderedSelection = items
      .map((item: any) => String(item.id))
      .filter((id: string) => selectedIds.has(id));
    const mediaIdsToDrag =
      selectedIds.has(itemId) && orderedSelection.length > 0
        ? orderedSelection
        : [itemId];

    if (!selectedIds.has(itemId)) {
      setSelectedIds(new Set([itemId]));
      const idx = items.findIndex((item: any) => String(item.id) === itemId);
      setRangeAnchorIndex(idx >= 0 ? idx : null);
    }

    e.dataTransfer.setData(
      "application/x-media-ids",
      JSON.stringify(mediaIdsToDrag)
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const handleItemClick = (
    e: React.MouseEvent<HTMLDivElement>,
    itemId: string,
    itemIndex: number
  ) => {
    const isRangeSelect = e.shiftKey;
    const isToggleSelect = e.metaKey || e.ctrlKey;

    if (isRangeSelect) {
      e.preventDefault();
      e.stopPropagation();

      const anchor =
        rangeAnchorIndex !== null
          ? rangeAnchorIndex
          : items.findIndex((item: any) => selectedIds.has(String(item.id)));
      const safeAnchor = anchor >= 0 ? anchor : itemIndex;
      const start = Math.min(safeAnchor, itemIndex);
      const end = Math.max(safeAnchor, itemIndex);
      const range = new Set<string>();
      for (let i = start; i <= end; i++) {
        range.add(String(items[i].id));
      }
      setSelectedIds(range);
      setRangeAnchorIndex(safeAnchor);
      return;
    }

    if (isToggleSelect) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
      setRangeAnchorIndex(itemIndex);
      return;
    }

    // Default click behavior keeps edit flow unchanged.
    setEditingId(itemId);
  };

  // ── Drag handlers for folder tree drop targets ──
  const handleFolderDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("application/x-media-ids")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleFolderDragEnter = useCallback((e: React.DragEvent, folderId: number | "unfiled") => {
    e.preventDefault();
    const counter = (dragCounterRef.current.get(folderId) || 0) + 1;
    dragCounterRef.current.set(folderId, counter);
    if (counter === 1) {
      setDragOverId(folderId);
    }
  }, []);

  const handleFolderDragLeave = useCallback((e: React.DragEvent, folderId: number | "unfiled") => {
    const counter = (dragCounterRef.current.get(folderId) || 0) - 1;
    dragCounterRef.current.set(folderId, Math.max(0, counter));
    if (counter <= 0) {
      dragCounterRef.current.delete(folderId);
      setDragOverId((prev) => (prev === folderId ? null : prev));
    }
  }, []);

  const handleFolderDrop = useCallback((e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault();
    dragCounterRef.current.clear();
    setDragOverId(null);

    const raw = e.dataTransfer.getData("application/x-media-ids");
    if (!raw) return;

    try {
      const mediaIds = JSON.parse(raw) as string[];
      if (mediaIds.length === 0) return;

      moveFetcher.submit(
        {
          intent: "move-to-folder",
          media_ids: JSON.stringify(mediaIds),
          target_folder_id: targetFolderId !== null ? String(targetFolderId) : "",
        },
        { method: "post" }
      );
      setSelectedIds(new Set());
      setRangeAnchorIndex(null);
    } catch {
      // ignore parse errors
    }
  }, [moveFetcher]);

  // Build folder link preserving search param
  const folderLink = (folderValue: string | null) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (folderValue) params.set("folder", folderValue);
    const qs = params.toString();
    return `/admin/media${qs ? `?${qs}` : ""}`;
  };

  // Find current folder name for display
  const findFolderName = (nodes: MediaFolderTreeNode[], id: number): string | null => {
    for (const node of nodes) {
      if (node.id === id) return node.name;
      if (node.children.length > 0) {
        const found = findFolderName(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Folder tree sidebar */}
      <FolderTreeSidebar
        tree={tree}
        totalCount={totalCount}
        unfiledCount={unfiledCount}
        currentFolder={currentFolder ?? null}
        search={search}
        dragOverId={dragOverId}
        onDragOver={handleFolderDragOver}
        onDragEnterFolder={handleFolderDragEnter}
        onDragLeaveFolder={handleFolderDragLeave}
        onDropFolder={handleFolderDrop}
      />

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
            <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
            <span>/</span>
            <span>Media Library</span>
          </div>

          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-dark">Media Library</h1>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Upload Files
            </button>
          </div>

          {/* Search bar */}
          <Form method="get" className="mb-6">
            {currentFolder && <input type="hidden" name="folder" value={currentFolder} />}
            <div className="flex gap-3">
              <input
                type="text"
                name="q"
                defaultValue={search}
                placeholder="Search by filename, title, or alt text..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Search
              </button>
              {search && (
                <Link
                  to={folderLink(currentFolder ?? null)}
                  className="px-4 py-2 text-gray-500 text-sm hover:text-gray-700"
                >
                  Clear
                </Link>
              )}
            </div>
          </Form>

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-gray-500">
              {selectedIds.size > 0 ? (
                <span>
                  <strong className="text-dark">{selectedIds.size}</strong>{" "}
                  selected. Drag any selected item to move all selected items.
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIds(new Set());
                      setRangeAnchorIndex(null);
                    }}
                    className="ml-2 text-primary hover:underline"
                  >
                    Clear selection
                  </button>
                </span>
              ) : (
                <span>
                  Hold <kbd className="px-1 py-0.5 border border-gray-300 rounded bg-white">Shift</kbd>{" "}
                  for range select or{" "}
                  <kbd className="px-1 py-0.5 border border-gray-300 rounded bg-white">Cmd/Ctrl</kbd>{" "}
                  for multi-select.
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Thumbnail Size
              </span>
              {[3, 4, 5, 6].map((cols) => {
                const isActive = gridColumns === cols;
                return (
                  <button
                    key={cols}
                    type="button"
                    onClick={() => setGridColumns(cols as MediaGridColumns)}
                    className={`min-w-[44px] px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                      isActive
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-gray-600 border-gray-300 hover:border-primary/50 hover:text-primary"
                    }`}
                    title={`${cols} columns`}
                    aria-label={`Show ${cols} columns`}
                    aria-pressed={isActive}
                  >
                    {cols}
                  </button>
                );
              })}
            </div>
          </div>

          {!r2Ready && (
            <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm">
              <strong>Note:</strong> Cloud storage (R2) is not configured. Set{" "}
              <code className="bg-amber-100 px-1 rounded">R2_ACCOUNT_ID</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">R2_ACCESS_KEY_ID</code>,{" "}
              <code className="bg-amber-100 px-1 rounded">R2_SECRET_ACCESS_KEY</code>{" "}
              environment variables to enable uploads.
            </div>
          )}

          {/* Upload zone */}
          <Form method="post" encType="multipart/form-data" ref={formRef} className="mb-8">
            <input type="hidden" name="intent" value="upload" />
            <input type="hidden" name="return_folder" value={currentFolder || ""} />
            <input type="hidden" name="return_search" value={search || ""} />
            <input
              type="hidden"
              name="target_folder_id"
              value={
                currentFolder && currentFolder !== "unfiled" ? currentFolder : ""
              }
            />
            <input
              type="file"
              name="files"
              multiple
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.pdf,.svg"
              className="hidden"
            />
            <div
              className={`bg-white border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                isUploading
                  ? "border-primary/50 bg-cream/30"
                  : "border-gray-300 hover:border-primary/50"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-primary", "bg-cream/30");
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove("border-primary", "bg-cream/30");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-primary", "bg-cream/30");
                if (e.dataTransfer.files.length && fileInputRef.current) {
                  fileInputRef.current.files = e.dataTransfer.files;
                  handleFileChange();
                }
              }}
            >
              {isUploading ? (
                <>
                  <svg className="mx-auto h-10 w-10 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-primary">Uploading...</p>
                </>
              ) : (
                <>
                  <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-700">Drag and drop files here, or click to browse</p>
                  <p className="mt-1 text-xs text-gray-400">Supports: JPG, PNG, SVG, PDF (max 10MB)</p>
                </>
              )}
            </div>
          </Form>

          {/* Media grid */}
          <div className={`grid ${gridLayout.gridClass} ${gridLayout.gapClass} mb-6`}>
            {items.map((item: any, itemIndex: number) => {
              const useCount = (usageCounts as Record<string, number>)?.[item.url] || 0;
              const itemId = String(item.id);
              const isSelected = selectedIds.has(itemId);
              return (
                <div
                  key={item.id}
                  className={`group bg-white border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all ${
                    isSelected
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-gray-200"
                  }`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, itemId)}
                  onClick={(e) => handleItemClick(e, itemId, itemIndex)}
                >
                  {/* Thumbnail */}
                  <div className={`relative checkerboard ${gridLayout.thumbClass}`}>
                    {item.url && !item.url.startsWith("/placeholder") ? (
                      <img
                        src={item.url}
                        alt={item.alt_text || item.filename}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div
                        className={`w-full h-full bg-gradient-to-br ${getGradient(item.filename)} flex items-center justify-center`}
                      >
                        <span className="text-white/80 text-xs font-medium px-2 text-center">{item.filename}</span>
                      </div>
                    )}
                    {/* Selection / usage badges (top-left) */}
                    {isSelected && (
                      <div className="absolute top-2 left-2">
                        <span className="bg-primary text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                          Selected
                        </span>
                      </div>
                    )}
                    {useCount > 0 && (
                      <div className={`absolute top-2 ${isSelected ? "left-[70px]" : "left-2"}`}>
                        <span className="bg-blue-500 text-white text-[9px] font-medium px-1.5 py-0.5 rounded">
                          {useCount}x used
                        </span>
                      </div>
                    )}
                    {/* SEO status indicator (top-right) */}
                    <div className="absolute top-2 right-2">
                      {item.alt_text ? (
                        <span className="bg-emerald-500 text-white text-[9px] font-medium px-1.5 py-0.5 rounded">
                          ALT
                        </span>
                      ) : (
                        <span className="bg-amber-500 text-white text-[9px] font-medium px-1.5 py-0.5 rounded">
                          No ALT
                        </span>
                      )}
                    </div>
                    {/* Drag handle indicator */}
                    <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="bg-black/50 text-white text-[9px] font-medium px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                        Drag to folder
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {item.title || item.filename}
                    </p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {item.alt_text || "No alt text set"}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-gray-500">
                        {formatBytes(item.size_bytes)}
                        {item.width && item.height ? ` \u00B7 ${item.width}\u00D7${item.height}` : ""}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatShortDate(item.uploaded_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {items.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              {search ? `No results for "${search}"` : "No media files yet. Upload your first file above."}
            </div>
          )}

          {items.length > 0 && (
            <p className="text-sm text-gray-500 text-center">
              Showing {items.length} item{items.length !== 1 ? "s" : ""}
              {search ? ` matching "${search}"` : ""}
              {currentFolder === "unfiled"
                ? " (unfiled)"
                : currentFolder
                  ? ` in ${findFolderName(tree, Number(currentFolder)) || "folder"}`
                  : ""}
            </p>
          )}
        </div>
      </div>

      {/* Edit panel */}
      {editingItem && (
        <EditPanel
          item={editingItem}
          folderTree={tree}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}
