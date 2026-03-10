import { useRef, useState } from "react";

interface GalleryUploaderProps {
  /** Current gallery URLs */
  value: string[];
  /** Called with the updated array after add/remove/reorder */
  onChange: (urls: string[]) => void;
  /** Maximum number of images */
  max?: number;
}

/**
 * Multi-image gallery uploader.
 * Uploads to /api/upload-image, shows thumbnails, supports remove and reorder.
 */
export default function GalleryUploader({
  value,
  onChange,
  max = 20,
}: GalleryUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (files: FileList) => {
    setError(null);
    setUploading(true);

    const newUrls = [...value];
    let uploadCount = 0;

    for (const file of Array.from(files)) {
      if (newUrls.length >= max) break;
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 10 * 1024 * 1024) continue;

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/upload-image", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          newUrls.push(data.url);
          uploadCount++;
        }
      } catch {
        // continue with other files
      }
    }

    if (uploadCount > 0) {
      onChange(newUrls);
    } else {
      setError("No images were uploaded. Check file types and sizes.");
    }
    setUploading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files);
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    const newUrls = value.filter((_, i) => i !== index);
    onChange(newUrls);
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const newUrls = [...value];
    const [moved] = newUrls.splice(from, 1);
    newUrls.splice(to, 0, moved);
    onChange(newUrls);
  };

  return (
    <div>
      <label className="flex h-6 items-center text-xs font-medium text-gray-500 mb-1 leading-none">
        Gallery Images
        <span className="text-gray-400 font-normal ml-1">({value.length}/{max})</span>
      </label>

      {/* Thumbnail grid */}
      {value.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-3">
          {value.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group h-28 rounded-lg overflow-hidden border border-gray-200 checkerboard">
              <img src={url} alt="" className="w-full h-full object-contain" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => moveImage(i, i - 1)}
                      className="w-6 h-6 bg-white rounded text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100"
                      title="Move left"
                    >
                      &#8592;
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="w-6 h-6 bg-red-500 rounded text-white text-xs flex items-center justify-center hover:bg-red-600"
                    title="Remove"
                  >
                    &#10005;
                  </button>
                  {i < value.length - 1 && (
                    <button
                      type="button"
                      onClick={() => moveImage(i, i + 1)}
                      className="w-6 h-6 bg-white rounded text-gray-600 text-xs flex items-center justify-center hover:bg-gray-100"
                      title="Move right"
                    >
                      &#8594;
                    </button>
                  )}
                </div>
              </div>
              {i === 0 && (
                <span className="absolute top-1 left-1 text-[9px] bg-primary text-white px-1.5 py-0.5 rounded font-medium">
                  Primary
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add button */}
      {value.length < max && (
        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          disabled={uploading}
          className={`w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed rounded-lg text-xs font-medium transition-colors ${
            uploading
              ? "border-gray-200 bg-gray-50 text-gray-400 cursor-wait"
              : "border-gray-300 text-gray-500 hover:border-primary hover:text-primary cursor-pointer"
          }`}
        >
          {uploading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Uploading...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Images
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <p className="text-xs text-gray-400 mt-1">
        Upload multiple images. The first image is used as the primary gallery image.
      </p>
    </div>
  );
}
