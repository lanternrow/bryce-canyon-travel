import { useRouteLoaderData } from "react-router";

interface GoogleMapProps {
  lat: number;
  lng: number;
  name: string;
  address?: string | null;
  googlePlaceId?: string | null;
}

/**
 * Google Maps Embed API iframe — zero JS SDK, just an iframe.
 * Uses the Google Places API key from admin settings (loaded in root).
 * Falls back to a static address + directions link if no API key.
 */
export default function GoogleMap({
  lat,
  lng,
  name,
  address,
  googlePlaceId,
}: GoogleMapProps) {
  const rootData = useRouteLoaderData("root") as any;
  const apiKey = rootData?.settings?.google_places_api_key;

  // Build the embed URL — prefer place_id for accuracy, fall back to coords
  const query = googlePlaceId
    ? `place_id:${googlePlaceId}`
    : `${lat},${lng}`;

  const directionsUrl = `https://maps.google.com/maps/dir/?api=1&destination=${lat},${lng}${googlePlaceId ? `&destination_place_id=${googlePlaceId}` : ""}`;

  // No API key → static fallback with address + directions link
  if (!apiKey) {
    return (
      <div className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden">
        <div className="h-48 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-10 h-10 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {address && <p className="mt-2 text-sm text-gray-500 px-4">{address}</p>}
          </div>
        </div>
        <div className="px-4 py-3 border-t border-gray-200">
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Get Directions
          </a>
        </div>
      </div>
    );
  }

  const embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(query)}&zoom=15`;

  return (
    <div className="bg-gray-100 border border-gray-200 rounded-2xl overflow-hidden">
      <iframe
        title={`Map showing ${name}`}
        src={embedUrl}
        className="w-full h-48 border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:text-primary/80 font-medium transition-colors flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Get Directions
        </a>
        <svg className="w-16 h-4 text-gray-400" viewBox="0 0 120 30" fill="currentColor">
          <text x="0" y="22" fontSize="12" fontFamily="Arial, sans-serif" fill="currentColor">Google</text>
        </svg>
      </div>
    </div>
  );
}
