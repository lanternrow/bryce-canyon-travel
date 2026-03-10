import { useEffect, useRef, useState } from "react";

interface FocalPointPickerProps {
  imageUrl: string | null | undefined;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  label?: string;
  hint?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: number, fallback = 50) {
  if (!Number.isFinite(value)) return fallback;
  return clamp(Math.round(value), 0, 100);
}

export default function FocalPointPicker({
  imageUrl,
  x,
  y,
  onChange,
  label = "Image Focus Point",
  hint = "Drag the dot to set which area stays centered when the image is cropped.",
}: FocalPointPickerProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });

  const focusX = normalize(x, 50);
  const focusY = normalize(y, 50);

  useEffect(() => {
    if (!previewRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      setBoxSize({ width: rect.width, height: rect.height });
    });
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, []);

  const getDisplayedImageRect = () => {
    if (
      naturalSize.width <= 0 ||
      naturalSize.height <= 0 ||
      boxSize.width <= 0 ||
      boxSize.height <= 0
    ) {
      return { left: 0, top: 0, width: boxSize.width, height: boxSize.height };
    }
    const scale = Math.min(
      boxSize.width / naturalSize.width,
      boxSize.height / naturalSize.height
    );
    const width = naturalSize.width * scale;
    const height = naturalSize.height * scale;
    return {
      left: (boxSize.width - width) / 2,
      top: (boxSize.height - height) / 2,
      width,
      height,
    };
  };

  const applyFromClientPoint = (clientX: number, clientY: number) => {
    if (!previewRef.current || !imageUrl) return;
    const rect = previewRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const imageRect = getDisplayedImageRect();
    const clampedX = clamp(localX, imageRect.left, imageRect.left + imageRect.width);
    const clampedY = clamp(localY, imageRect.top, imageRect.top + imageRect.height);
    const nextX = ((clampedX - imageRect.left) / imageRect.width) * 100;
    const nextY = ((clampedY - imageRect.top) / imageRect.height) * 100;
    onChange(normalize(nextX), normalize(nextY));
  };

  const imageRect = getDisplayedImageRect();
  const markerLeft = imageRect.left + imageRect.width * (focusX / 100);
  const markerTop = imageRect.top + imageRect.height * (focusY / 100);

  return (
    <div>
      <label className="flex h-6 items-center text-xs font-medium text-gray-500 mb-1 leading-none">
        {label}
      </label>

      <div
        ref={previewRef}
        className={`relative h-48 rounded-lg border overflow-hidden checkerboard ${
          imageUrl
            ? "cursor-crosshair border-gray-200"
            : "bg-gray-50 border-dashed border-gray-300"
        }`}
        onPointerDown={(e) => {
          if (!imageUrl) return;
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          setIsDragging(true);
          applyFromClientPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!isDragging) return;
          applyFromClientPoint(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (!imageUrl) return;
          if ((e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) {
            (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
          }
          setIsDragging(false);
        }}
        onPointerCancel={() => setIsDragging(false)}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
              onLoad={(e) => {
                setNaturalSize({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                });
              }}
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-black/10" />
            <div
              className="absolute border border-white/50 pointer-events-none"
              style={{
                left: imageRect.left,
                top: imageRect.top,
                width: imageRect.width,
                height: imageRect.height,
              }}
            />
            <div
              className="absolute w-4 h-4 rounded-full border-2 border-white bg-primary shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: markerLeft, top: markerTop }}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 px-3 text-center">
            Select an image first to place a focus point.
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">X</span>
          <input
            type="number"
            min={0}
            max={100}
            value={focusX}
            onChange={(e) =>
              onChange(normalize(Number(e.target.value), focusX), focusY)
            }
            className="w-14 px-1.5 py-1 border border-gray-300 rounded-lg text-xs text-center font-mono focus:outline-none focus:border-primary"
            disabled={!imageUrl}
          />
          <span className="text-[10px] text-gray-400">%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400">Y</span>
          <input
            type="number"
            min={0}
            max={100}
            value={focusY}
            onChange={(e) =>
              onChange(focusX, normalize(Number(e.target.value), focusY))
            }
            className="w-14 px-1.5 py-1 border border-gray-300 rounded-lg text-xs text-center font-mono focus:outline-none focus:border-primary"
            disabled={!imageUrl}
          />
          <span className="text-[10px] text-gray-400">%</span>
        </div>
      </div>

      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}
