import { useState, useEffect, useCallback, useRef } from "react";

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  photographer: string;
  photographerUrl: string;
  alt: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    tiny: string;
  };
}

interface PexelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: (media: any) => void;
  folderId?: number | null;
}

const SIZE_PRESETS = [
  { label: "Small (640px)", value: 640 },
  { label: "Medium (1200px)", value: 1200 },
  { label: "Large (1920px)", value: 1920 },
  { label: "XL (2560px)", value: 2560 },
  { label: "Original", value: null },
  { label: "Custom", value: "custom" as const },
];

type SizePresetValue = number | null | "custom";

function PexelsPagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const WINDOW = 5;
  let start = Math.max(1, page - Math.floor(WINDOW / 2));
  let end = start + WINDOW - 1;
  if (end > totalPages) { end = totalPages; start = Math.max(1, end - WINDOW + 1); }
  const pages: number[] = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const btnClass = (active: boolean, disabled: boolean) =>
    `px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
      active
        ? "bg-primary text-white border-primary"
        : disabled
        ? "text-gray-300 border-gray-200 cursor-default"
        : "text-gray-600 border-gray-300 hover:bg-gray-50 cursor-pointer"
    }`;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button onClick={() => onPageChange(1)} disabled={page === 1} className={btnClass(false, page === 1)}>&laquo;&laquo;</button>
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className={btnClass(false, page === 1)}>&lsaquo;</button>
      {start > 1 && <span className="px-1 text-xs text-gray-400">...</span>}
      {pages.map((p) => (
        <button key={p} onClick={() => onPageChange(p)} className={btnClass(p === page, false)}>{p}</button>
      ))}
      {end < totalPages && <span className="px-1 text-xs text-gray-400">...</span>}
      <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className={btnClass(false, page === totalPages)}>&rsaquo;</button>
      <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} className={btnClass(false, page === totalPages)}>&raquo;&raquo;</button>
    </div>
  );
}

export default function PexelsModal({ isOpen, onClose, onImported, folderId }: PexelsModalProps) {
  const [query, setQuery] = useState("");
  const [orientation, setOrientation] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PexelsPhoto[]>([]);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [perPage] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<PexelsPhoto | null>(null);
  const [sizePreset, setSizePreset] = useState<SizePresetValue>(1200);
  const [customLongEdge, setCustomLongEdge] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalPages = Math.ceil(totalResults / perPage);

  const doSearch = useCallback(async (q: string, p: number, orient: string | null) => {
    if (!q.trim()) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ query: q.trim(), page: String(p), per_page: String(perPage) });
      if (orient) params.set("orientation", orient);
      const res = await fetch(`/api/admin/media/pexels?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setPhotos(data.photos || []);
      setImportedIds(data.importedIds || []);
      setTotalResults(data.totalResults || 0);
      setPage(data.page || 1);
    } catch (err: any) {
      setError(err.message);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [perPage]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) { setPhotos([]); setTotalResults(0); return; }
    searchTimerRef.current = setTimeout(() => { doSearch(query, 1, orientation); }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query, orientation, doSearch]);

  const handlePageChange = (p: number) => { doSearch(query, p, orientation); setSelectedPhoto(null); };

  const handleImport = async () => {
    if (!selectedPhoto) return;
    setImporting(true);
    setImportError("");
    const longEdge = sizePreset === "custom" ? (customLongEdge ? Number(customLongEdge) : null) : sizePreset;
    try {
      const res = await fetch("/api/admin/media/pexels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pexelsId: selectedPhoto.id,
          imageUrl: selectedPhoto.src.original,
          longEdge,
          photographer: selectedPhoto.photographer,
          photographerUrl: selectedPhoto.photographerUrl,
          altText: selectedPhoto.alt,
          originalWidth: selectedPhoto.width,
          originalHeight: selectedPhoto.height,
          folderId: folderId || null,
        }),
      });
      const data = await res.json();
      if (res.status === 409) { setImportError("Already imported."); setImportedIds(prev => [...prev, String(selectedPhoto.id)]); return; }
      if (!res.ok) throw new Error(data.error || "Import failed");
      setImportedIds(prev => [...prev, String(selectedPhoto.id)]);
      setSelectedPhoto(null);
      if (onImported) onImported(data.media);
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  const orientations = [
    { label: "All", value: null },
    { label: "Landscape", value: "landscape" },
    { label: "Portrait", value: "portrait" },
    { label: "Square", value: "square" },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-[95vw] max-w-[1100px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Search Pexels Photos</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Search + Orientation */}
        <div className="px-5 py-3 border-b border-gray-200 space-y-2.5">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search free stock photos..." autoFocus className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {orientations.map(({ label, value }) => (
              <button key={label} onClick={() => setOrientation(value)} className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${orientation === value ? "bg-primary text-white border-primary" : "text-gray-600 border-gray-300 hover:bg-gray-50"}`}>{label}</button>
            ))}
            {totalPages > 1 && <div className="ml-auto"><PexelsPagination page={page} totalPages={totalPages} onPageChange={handlePageChange} /></div>}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg mb-3 text-sm">{error}</div>}
          {loading && (
            <div className="flex justify-center py-16">
              <svg className="w-8 h-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            </div>
          )}
          {!loading && photos.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {photos.map((photo) => {
                  const isImported = importedIds.includes(String(photo.id));
                  const isSelected = selectedPhoto?.id === photo.id;
                  return (
                    <div key={photo.id} onClick={() => !isImported && setSelectedPhoto(isSelected ? null : photo)} className={`relative rounded-lg overflow-hidden cursor-pointer border-[3px] aspect-square bg-gray-100 group ${isImported ? "border-green-500" : isSelected ? "border-primary" : "border-transparent hover:border-gray-300"}`}>
                      <img src={photo.src.medium} alt={photo.alt} loading="lazy" className="w-full h-full object-cover" />
                      {isImported && (
                        <div className="absolute top-1.5 right-1.5 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-black/55 text-white text-[11px] truncate">{photo.photographer}</div>
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && <div className="flex justify-center mt-4"><PexelsPagination page={page} totalPages={totalPages} onPageChange={handlePageChange} /></div>}
            </>
          )}
          {!loading && query && photos.length === 0 && !error && <p className="text-center text-gray-400 py-16">No photos found for &ldquo;{query}&rdquo;</p>}
          {!query && <p className="text-center text-gray-400 py-16">Start typing to search Pexels for free stock photos</p>}
        </div>

        {/* Import panel */}
        {selectedPhoto && (
          <div className="border-t border-gray-200 px-5 py-3 flex items-center gap-4 flex-wrap bg-gray-50">
            <span className="text-sm font-medium text-gray-700">{selectedPhoto.width} &times; {selectedPhoto.height} &mdash; {selectedPhoto.photographer}</span>
            <div className="flex gap-1.5 flex-wrap">
              {SIZE_PRESETS.map(({ label, value }) => (
                <button key={label} onClick={() => setSizePreset(value)} className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${sizePreset === value ? "bg-primary text-white border-primary" : "text-gray-600 border-gray-300 hover:bg-gray-50"}`}>{label}</button>
              ))}
            </div>
            {sizePreset === "custom" && (
              <input type="number" value={customLongEdge} onChange={(e) => setCustomLongEdge(e.target.value)} placeholder="Long edge px" min={100} max={6000} className="w-28 px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm" />
            )}
            {importError && <span className="text-red-600 text-sm">{importError}</span>}
            <button onClick={handleImport} disabled={importing} className="ml-auto px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-wait flex items-center gap-2">
              {importing ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Importing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Import Photo
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
