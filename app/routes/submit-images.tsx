import { useState, useRef, useCallback, useEffect } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/submit-images";
import {
  getListingBySubmissionToken,
  findMediaFolderBySlug,
  countMediaInFolder,
  getMedia,
} from "../lib/queries.server";
import { processImageForSubmission } from "../lib/image-processing.client";
import { siteConfig } from "../lib/site-config";

// ── Meta ──

export function meta({ data }: Route.MetaArgs) {
  const name = (data as any)?.listing?.name || "Submit Photos";
  return [
    { title: `Submit Photos for ${name} | ${siteConfig.siteName}` },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

// ── Loader (server-side) ──

export async function loader({ params }: Route.LoaderArgs) {
  const { token } = params;
  if (!token) {
    throw new Response("Invalid submission link", { status: 404 });
  }

  const listing = await getListingBySubmissionToken(token);
  if (!listing) {
    throw new Response("This submission link is invalid or has expired.", {
      status: 404,
    });
  }

  // Fetch already-submitted images for this listing
  const folderSlug = `submissions-${listing.slug}`;
  const folder = await findMediaFolderBySlug(folderSlug);
  const uploadedCount = folder ? await countMediaInFolder(folder.id) : 0;
  const maxUploads = 10;

  // Load existing images so returning visitors can see what they've already uploaded
  let existingImages: { url: string; filename: string }[] = [];
  if (folder && uploadedCount > 0) {
    const media = await getMedia({ folderId: folder.id, limit: maxUploads });
    existingImages = (media as any[]).map((m) => ({
      url: m.url,
      filename: m.filename,
    }));
  }

  return {
    listing: { name: listing.name, type: listing.type },
    token,
    uploadedCount,
    maxUploads,
    remainingSlots: Math.max(0, maxUploads - uploadedCount),
    existingImages,
  };
}

// ── Types ──

interface FileUploadState {
  id: string;
  file: File;
  status: "processing" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  url?: string;
}

// ── Component ──

export default function SubmitImagesPage() {
  const { listing, token, uploadedCount, maxUploads, remainingSlots, existingImages } =
    useLoaderData<typeof loader>();

  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const [completedCount, setCompletedCount] = useState(uploadedCount);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const currentRemaining = maxUploads - completedCount;
  const allDone = currentRemaining <= 0;

  // ── Upload a single file ──
  const uploadFile = useCallback(
    async (file: File, uploadId: string) => {
      // 1. Client-side processing (resize, validate, convert to WebP)
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId ? { ...u, status: "processing" as const, progress: 10 } : u
        )
      );

      const result = await processImageForSubmission(file);
      if (!result.ok) {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, status: "error" as const, error: result.error.message }
              : u
          )
        );
        return;
      }

      // 2. Upload processed blob
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId ? { ...u, status: "uploading" as const, progress: 40 } : u
        )
      );

      const { blob, width, height } = result.data;
      const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
      const processedFile = new File(
        [blob],
        file.name.replace(/\.[^.]+$/, ext),
        { type: blob.type }
      );

      const formData = new FormData();
      formData.append("token", token);
      formData.append("file", processedFile);
      formData.append("width", String(width));
      formData.append("height", String(height));

      try {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId ? { ...u, progress: 60 } : u
          )
        );

        const res = await fetch("/api/submit-images", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          setUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId
                ? { ...u, status: "error" as const, error: data.error || "Upload failed" }
                : u
            )
          );
          return;
        }

        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, status: "done" as const, progress: 100, url: data.url }
              : u
          )
        );
        setCompletedCount((c) => c + 1);
      } catch {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === uploadId
              ? { ...u, status: "error" as const, error: "Network error. Please try again." }
              : u
          )
        );
      }
    },
    [token]
  );

  // ── Handle files (from input or drop) ──
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const remaining = maxUploads - completedCount;
      const fileArray = Array.from(files).slice(0, remaining);

      if (fileArray.length === 0) return;

      const newUploads: FileUploadState[] = fileArray.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        status: "processing" as const,
        progress: 0,
      }));

      setUploads((prev) => [...prev, ...newUploads]);

      // Start uploads (sequential to avoid overwhelming the server)
      (async () => {
        for (const upload of newUploads) {
          await uploadFile(upload.file, upload.id);
        }
      })();
    },
    [completedCount, maxUploads, uploadFile]
  );

  // ── Drag-and-drop handlers ──
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (dragCounter.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // ── Remove an errored upload to retry ──
  const removeUpload = (uploadId: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== uploadId));
  };

  const successfulUploads = uploads.filter((u) => u.status === "done");
  const activeUploads = uploads.filter(
    (u) => u.status === "processing" || u.status === "uploading"
  );
  const errorUploads = uploads.filter((u) => u.status === "error");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-dark text-white py-16">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-xs text-sand mb-4">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Photo Submission
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Submit Photos</h1>
          <p className="mt-2 text-lg text-sand">{listing.name}</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* ── Requirements ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="font-semibold text-dark mb-3 flex items-center gap-2">
            <svg
              className="w-4 h-4 text-sage"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Photo Requirements
          </h2>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-sage mt-0.5">&#10003;</span>
              Minimum resolution: 1200 &times; 900 pixels
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage mt-0.5">&#10003;</span>
              Maximum file size: 5MB per image
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage mt-0.5">&#10003;</span>
              Accepted formats: JPEG, PNG, WebP
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage mt-0.5">&#10003;</span>
              Landscape orientation preferred
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sage mt-0.5">&#10003;</span>
              Up to {maxUploads} photos per submission
            </li>
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            Large images will be automatically optimized for web display.
          </p>
        </div>

        {/* ── Progress bar + counter ── */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {completedCount} of {maxUploads} photos submitted
          </span>
          {allDone && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-medium">
              Complete
            </span>
          )}
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-8">
          <div
            className="bg-primary h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / maxUploads) * 100}%` }}
          />
        </div>

        {/* ── Drop zone or thank-you ── */}
        {allDone ? (
          <div className="text-center py-16 bg-emerald-50 rounded-xl border border-emerald-200">
            <svg
              className="w-16 h-16 text-emerald-500 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="text-xl font-bold text-dark">Thank You!</h2>
            <p className="mt-2 text-gray-600 max-w-sm mx-auto">
              All {maxUploads} photos have been received. Our team will review
              them and add the best ones to your listing.
            </p>
          </div>
        ) : (
          <div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <svg
              className={`w-12 h-12 mx-auto mb-4 transition-colors ${
                isDragging ? "text-primary" : "text-gray-300"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>

            <p className="text-gray-700 font-medium mb-1">
              {isDragging ? "Drop photos here" : "Drag & drop photos here"}
            </p>
            <p className="text-sm text-gray-500">
              or{" "}
              <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-3">
              {currentRemaining} photo{currentRemaining !== 1 ? "s" : ""} remaining
              &middot; JPEG, PNG, WebP
            </p>
          </div>
        )}

        {/* ── Error uploads ── */}
        {errorUploads.length > 0 && (
          <div className="mt-6 space-y-2">
            {errorUploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3"
              >
                <svg
                  className="w-5 h-5 text-red-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-800 truncate">
                    {upload.file.name}
                  </p>
                  <p className="text-xs text-red-600">{upload.error}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeUpload(upload.id)}
                  className="text-red-400 hover:text-red-600 text-xs font-medium flex-shrink-0"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Active uploads ── */}
        {activeUploads.length > 0 && (
          <div className="mt-6 space-y-3">
            {activeUploads.map((upload) => (
              <div
                key={upload.id}
                className="bg-white border border-gray-200 rounded-lg px-4 py-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-700 truncate pr-4">
                    {upload.file.name}
                  </p>
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {upload.status === "processing"
                      ? "Optimizing..."
                      : "Uploading..."}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Uploaded photos grid (existing + newly uploaded) ── */}
        {(existingImages.length > 0 || successfulUploads.length > 0) && (
          <div className="mt-8">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Uploaded Photos
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {/* Previously uploaded images (from server) */}
              {existingImages
                .filter((img) => !successfulUploads.some((u) => u.url === img.url))
                .map((img) => (
                  <div
                    key={img.url}
                    className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200"
                  >
                    <img
                      src={img.url}
                      alt={img.filename}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1.5 right-1.5">
                      <span className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </span>
                    </div>
                  </div>
                ))}
              {/* Newly uploaded images (from current session) */}
              {successfulUploads.map((upload) => (
                <div
                  key={upload.id}
                  className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden border border-gray-200"
                >
                  {upload.url && (
                    <img
                      src={upload.url}
                      alt={upload.file.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute top-1.5 right-1.5">
                    <span className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer note ── */}
        <div className="mt-12 text-center">
          <p className="text-xs text-gray-400">
            Photos are securely uploaded and will be reviewed by the {siteConfig.siteName}
            team before being added to your listing.
          </p>
        </div>
      </div>
    </div>
  );
}
