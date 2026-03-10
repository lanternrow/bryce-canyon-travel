import { useEffect, useRef, useState } from "react";
import type { Listing } from "../lib/types";
import { siteConfig } from "../lib/site-config";

interface DirectoryMapProps {
  listings: Listing[];
  mediaMetadata?: Record<string, { alt_text?: string }>;
}

// Default map center — configured per destination
const MAP_CENTER: [number, number] = [siteConfig.mapCenter.lat, siteConfig.mapCenter.lng];
const DEFAULT_ZOOM = siteConfig.defaultZoom;

/**
 * Interactive Leaflet map for the directory page.
 * Dynamically imports Leaflet on the client to avoid SSR issues.
 */
export default function DirectoryMap({
  listings,
  mediaMetadata,
}: DirectoryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    async function init() {
      const L = (await import("leaflet")).default;

      if (cancelled || !containerRef.current) return;

      // --- Leaflet CSS (injected once) ---
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href =
          "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.crossOrigin = "";
        document.head.appendChild(link);
      }

      // --- Create map ---
      const map = L.map(containerRef.current, {
        center: MAP_CENTER,
        zoom: DEFAULT_ZOOM,
        scrollWheelZoom: true,
        zoomControl: true,
      });

      // --- Tile layer (OpenStreetMap) ---
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // --- Custom marker icon (Zion red) ---
      const markerIcon = L.divIcon({
        className: "zion-map-marker",
        html: `<svg width="28" height="40" viewBox="0 0 28 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="#C1440E"/>
          <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>`,
        iconSize: [28, 40],
        iconAnchor: [14, 40],
        popupAnchor: [0, -36],
      });

      // --- Add markers ---
      const validListings = listings.filter(
        (l) => l.lat != null && l.lng != null
      );

      const markers = validListings.map((listing) => {
        const lat = Number(listing.lat);
        const lng = Number(listing.lng);
        const href = `/listing/${listing.type}/${listing.slug}`;
        const alt =
          listing.featured_image && mediaMetadata?.[listing.featured_image]?.alt_text
            ? mediaMetadata[listing.featured_image].alt_text
            : listing.name;

        const imageHtml = listing.featured_image
          ? `<img src="${listing.featured_image}" alt="${alt}" style="width:100%;height:100px;object-fit:cover;border-radius:6px 6px 0 0;" loading="lazy"/>`
          : `<div style="width:100%;height:60px;background:linear-gradient(135deg,#f5f0e8,#e8e0d0);border-radius:6px 6px 0 0;display:flex;align-items:center;justify-content:center;">
               <svg width="24" height="24" fill="none" stroke="#b5a99a" viewBox="0 0 24 24" stroke-width="1.5">
                 <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"/>
               </svg>
             </div>`;

        const categoryHtml = listing.category_name
          ? `<span style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#8b7d6b;font-weight:600;">${listing.category_name}</span>`
          : "";

        const cityHtml = listing.city
          ? `<span style="font-size:10px;color:#9ca3af;">${listing.city}</span>`
          : "";

        const popupContent = `
          <div style="width:220px;font-family:system-ui,-apple-system,sans-serif;">
            ${imageHtml}
            <div style="padding:10px 12px 12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                ${categoryHtml}
                ${cityHtml}
              </div>
              <a href="${href}" style="font-size:14px;font-weight:600;color:#2d2926;text-decoration:none;line-height:1.3;display:block;">
                ${listing.name}
              </a>
              ${listing.tagline ? `<p style="font-size:12px;color:#6b7280;margin:4px 0 0;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${listing.tagline}</p>` : ""}
            </div>
          </div>
        `;

        const marker = L.marker([lat, lng], { icon: markerIcon })
          .addTo(map)
          .bindPopup(popupContent, {
            maxWidth: 240,
            minWidth: 220,
            className: "zion-map-popup",
          });

        return marker;
      });

      // --- Fit bounds to show all markers ---
      if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds().pad(0.15));

        // Don't zoom in too close for single marker
        if (markers.length === 1) {
          map.setZoom(14);
        }
      }

      mapRef.current = map;
      setReady(true);
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [listings, mediaMetadata]);

  const mappableCount = listings.filter(
    (l) => l.lat != null && l.lng != null
  ).length;
  const unmappableCount = listings.length - mappableCount;

  return (
    <div className="space-y-3">
      {/* Map container */}
      <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-sm bg-gray-100">
        <div
          ref={containerRef}
          className="w-full"
          style={{ height: "520px" }}
        />

        {/* Loading overlay */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Loading map...
            </div>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span>
          {mappableCount} listing{mappableCount !== 1 ? "s" : ""} on map
          {unmappableCount > 0 && (
            <span className="text-amber-600 ml-1">
              ({unmappableCount} missing coordinates)
            </span>
          )}
        </span>
        <span>Click a pin for details</span>
      </div>
    </div>
  );
}
