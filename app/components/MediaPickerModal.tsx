import { useState, useEffect, useRef, useCallback } from "react";

interface MediaItem {
  id: string;
  url: string;
  filename: string;
  alt_text?: string;
  title?: string;
  mime_type?: string;
  size_bytes?: number;
}

interface FolderTreeNode {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  media_count: number;
  total_count: number;
  children: FolderTreeNode[];
}

interface MediaPickerModalProps {
  onSelect: (url: string) => void;
  onClose: () => void;
}

// ── Compact folder tree node (read-only, no drag-drop) ──

function PickerTreeNode({
  node,
  activeFolder,
  onFolderChange,
  expandedIds,
  toggleExpand,
  depth,
}: {
  node: FolderTreeNode;
  activeFolder: string | null;
  onFolderChange: (folder: string | null) => void;
  expandedIds: Set<number>;
  toggleExpand: (id: number) => void;
  depth: number;
}) {
  const isActive = activeFolder === String(node.id);
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => onFolderChange(String(node.id))}
        className={`w-full flex items-center gap-1 py-1 pr-2 rounded text-xs transition-colors text-left ${
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-gray-700 hover:bg-gray-100"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        {/* Expand/collapse */}
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(node.id);
          }}
          className={`w-3 h-3 flex items-center justify-center flex-shrink-0 ${
            hasChildren ? "text-gray-400 hover:text-gray-600" : "invisible"
          }`}
        >
          <svg
            className={`w-2.5 h-2.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>

        <svg className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>

        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{node.total_count}</span>
      </button>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <PickerTreeNode
              key={child.id}
              node={child}
              activeFolder={activeFolder}
              onFolderChange={onFolderChange}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MediaPickerModal({ onSelect, onClose }: MediaPickerModalProps) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unfiledCount, setUnfiledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchMedia = useCallback(async (q: string, folder: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (folder) params.set("folder", folder);
      params.set("limit", "60");

      const res = await fetch(`/api/media-browse?${params.toString()}`);
      const data = await res.json();
      setMedia(data.media || []);
      if (data.folderTree) setFolderTree(data.folderTree);
      if (data.totalCount !== undefined) setTotalCount(data.totalCount);
      if (data.unfiledCount !== undefined) setUnfiledCount(data.unfiledCount);
    } catch {
      console.error("Failed to fetch media");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchMedia("", null);
    setTimeout(() => searchRef.current?.focus(), 100);
  }, [fetchMedia]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchMedia(value, activeFolder);
    }, 300);
  };

  const handleFolderChange = (folder: string | null) => {
    setActiveFolder(folder);
    fetchMedia(search, folder);
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Select Image</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by filename, title, or alt text..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        {/* Body: sidebar + grid */}
        <div className="flex flex-1 overflow-hidden">
          {/* Folder tree sidebar (compact, read-only) */}
          <div className="w-[180px] flex-shrink-0 border-r border-gray-100 overflow-y-auto py-2 px-2 space-y-0.5">
            {/* All */}
            <button
              type="button"
              onClick={() => handleFolderChange(null)}
              className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors text-left ${
                activeFolder === null
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
              </svg>
              <span className="flex-1">All</span>
              <span className="text-[10px] text-gray-400 tabular-nums">{totalCount}</span>
            </button>

            {/* Unfiled */}
            <button
              type="button"
              onClick={() => handleFolderChange("unfiled")}
              className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors text-left ${
                activeFolder === "unfiled"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
              </svg>
              <span className="flex-1">Unfiled</span>
              <span className="text-[10px] text-gray-400 tabular-nums">{unfiledCount}</span>
            </button>

            {folderTree.length > 0 && <div className="border-t border-gray-100 my-1.5" />}

            {/* Folder tree */}
            {folderTree.map((node) => (
              <PickerTreeNode
                key={node.id}
                node={node}
                activeFolder={activeFolder}
                onFolderChange={handleFolderChange}
                expandedIds={expandedIds}
                toggleExpand={toggleExpand}
                depth={0}
              />
            ))}
          </div>

          {/* Image grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : media.length === 0 ? (
              <div className="text-center py-16">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-500">
                  {search ? `No images matching "${search}"` : "No images in this folder"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {media.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.url)}
                    className="group text-left rounded-lg border border-gray-200 overflow-hidden hover:border-primary hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    <div className="aspect-square bg-gray-50 overflow-hidden">
                      {item.url && !item.url.startsWith("/placeholder") ? (
                        <img
                          src={item.url}
                          alt={item.alt_text || item.filename}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                          <span className="text-gray-500 text-xs px-2 text-center truncate">{item.filename}</span>
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="text-xs text-gray-700 truncate font-medium">
                        {item.title || item.filename}
                      </p>
                      {item.alt_text && (
                        <p className="text-[10px] text-gray-400 truncate">{item.alt_text}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {loading ? "Loading..." : `${media.length} image${media.length !== 1 ? "s" : ""}`}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
