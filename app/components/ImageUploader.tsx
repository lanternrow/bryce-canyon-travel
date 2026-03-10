import { useRef, useState } from "react";
import MediaPickerModal from "./MediaPickerModal";

interface ImageUploaderProps {
  /** Current image URL (if any) */
  value: string | null;
  /** Called with the new URL after upload, or null on remove */
  onChange: (url: string | null) => void;
  /** Label shown above the uploader */
  label?: string;
  /** Help text shown below */
  hint?: string;
}

/**
 * A self-contained featured image uploader with media library browser.
 * Supports: browse from library, upload via click/drag, preview, replace, remove.
 */
export default function ImageUploader({
  value,
  onChange,
  label = "Featured Image",
  hint,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const handleUpload = async (file: File) => {
    setError(null);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Upload failed");
      } else {
        onChange(data.url);
      }
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset input so same file can be re-selected
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleUpload(file);
    }
  };

  const handlePickerSelect = (url: string) => {
    onChange(url);
    setShowPicker(false);
  };

  return (
    <div>
      <label className="flex h-6 items-center text-xs font-medium text-gray-500 mb-1 leading-none">
        {label}
      </label>

      {value ? (
        /* Preview state */
        <div>
          <div className="relative group h-48 rounded-lg overflow-hidden border border-gray-200 checkerboard">
            <img
              src={value}
              alt="Featured"
              className="w-full h-full object-contain"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-lg shadow hover:bg-gray-50"
                >
                  Library
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-lg shadow hover:bg-gray-50"
                >
                  Upload
                </button>
                <button
                  type="button"
                  onClick={() => onChange(null)}
                  className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg shadow hover:bg-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state — browse + upload options */
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg transition-colors ${
            uploading
              ? "border-gray-200 bg-gray-50 cursor-wait"
              : dragOver
              ? "border-primary bg-red-50"
              : "border-gray-300"
          }`}
        >
          {uploading ? (
            <>
              <svg className="animate-spin h-8 w-8 text-primary mb-2" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-500">Uploading...</p>
            </>
          ) : (
            <>
              <svg className="w-8 h-8 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowPicker(true); }}
                className="px-4 py-1.5 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors mb-2"
              >
                Choose from Library
              </button>
              <p className="text-xs text-gray-400">
                or{" "}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                  className="text-primary font-medium hover:underline"
                >
                  upload a file
                </button>
                {" "}/ drag and drop
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-gray-400 mt-1">{hint}</p>
      )}

      {/* Media picker modal */}
      {showPicker && (
        <MediaPickerModal
          onSelect={handlePickerSelect}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
