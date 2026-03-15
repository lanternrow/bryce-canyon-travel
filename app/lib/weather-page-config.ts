import { siteConfig } from "./site-config";

export const DEFAULT_WEATHER_PAGE = {
  hero: {
    title: "WEATHER & FORECAST",
    subtitle: `Real-time conditions and trip-planning data for ${siteConfig.parkName}`,
    bg_image: "",
    bg_image_focal_x: 50,
    bg_image_focal_y: 50,
    gradient_from: "#1e3a5f",
    gradient_via: "#2d4a6f",
    gradient_to: "#1a3050",
    gradient_opacity: 100,
    gradient_direction: "to-br",
    height: 300,
    title_size_mobile: 48,
    title_size_desktop: 64,
    title_color: "#ffffff",
    subtitle_color: "#cbd5e1",
  },
};

export const DEFAULT_WEATHER_SEO = {
  meta_title: `${siteConfig.parkName} Weather & Forecast — Current Conditions & Seasonal Guide`,
  meta_description: `Real-time weather conditions, 16-day forecast, hourly outlook, seasonal guide, and trail safety tips for ${siteConfig.parkName}. Plan your visit with live data.`,
  focus_keyphrase: "",
  og_image: "",
};

export function mergeWeatherContent(pageContent: any) {
  if (!pageContent) return DEFAULT_WEATHER_PAGE;
  return {
    ...DEFAULT_WEATHER_PAGE,
    ...pageContent,
    hero: {
      ...DEFAULT_WEATHER_PAGE.hero,
      ...(pageContent.hero || {}),
    },
  };
}
