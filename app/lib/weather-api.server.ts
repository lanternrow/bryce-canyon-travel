// ============================================
// WEATHER API — Open-Meteo + Weather.gov (NWS)
// Real-time weather data for the weather page.
// Both APIs are free and require no API keys.
// ============================================

import { siteConfig } from "./site-config";
import { fetchNpsAlerts } from "./nps-api.server";
import type {
  CurrentWeather,
  HourlyForecast,
  DailyForecast,
  NwsForecastPeriod,
  WeatherAlert,
  WeatherData,
} from "./weather-data";

// ── Cache ──────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CACHE_TTL_CURRENT = 10 * 60 * 1000; // 10 minutes
const CACHE_TTL_FORECAST = 3 * 60 * 60 * 1000; // 3 hours
const CACHE_TTL_NWS = 30 * 60 * 1000; // 30 minutes

const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string, ttl: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

// ── NWS Gridpoint (cached indefinitely) ───────

let nwsGridpoint: { office: string; gridX: number; gridY: number } | null = null;

async function getNwsGridpoint(): Promise<{ office: string; gridX: number; gridY: number } | null> {
  if (nwsGridpoint) return nwsGridpoint;

  try {
    const { lat, lng } = siteConfig.mapCenter;
    const res = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
      headers: {
        "User-Agent": `(${siteConfig.siteUrl}, ${siteConfig.contactEmail})`,
        Accept: "application/geo+json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.error(`NWS /points error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const props = data.properties;
    nwsGridpoint = {
      office: props.gridId,
      gridX: props.gridX,
      gridY: props.gridY,
    };
    return nwsGridpoint;
  } catch (err: any) {
    console.error("NWS /points error:", err.message);
    return null;
  }
}

// ── Open-Meteo Fetch ──────────────────────────

interface OpenMeteoData {
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}

async function fetchOpenMeteo(): Promise<OpenMeteoData | null> {
  const { lat, lng } = siteConfig.mapCenter;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: [
      "temperature_2m", "relative_humidity_2m", "apparent_temperature",
      "precipitation", "weather_code", "cloud_cover", "pressure_msl",
      "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
      "uv_index", "visibility", "is_day", "dew_point_2m",
    ].join(","),
    hourly: [
      "temperature_2m", "apparent_temperature", "precipitation_probability",
      "precipitation", "weather_code", "wind_speed_10m",
      "relative_humidity_2m", "uv_index", "is_day",
    ].join(","),
    daily: [
      "weather_code", "temperature_2m_max", "temperature_2m_min",
      "sunrise", "sunset", "precipitation_sum",
      "precipitation_probability_max", "wind_speed_10m_max", "uv_index_max",
    ].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "America/Denver",
    forecast_days: "16",
    forecast_hours: "48",
  });

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`Open-Meteo error: HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();

    const current: CurrentWeather = {
      temperature: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      windDirection: data.current.wind_direction_10m,
      windGusts: data.current.wind_gusts_10m,
      uvIndex: data.current.uv_index,
      visibility: Math.round((data.current.visibility || 0) * 0.000621371 * 10) / 10, // meters → miles
      precipitation: data.current.precipitation,
      weatherCode: data.current.weather_code,
      isDay: !!data.current.is_day,
      cloudCover: data.current.cloud_cover,
      pressureMb: data.current.pressure_msl,
      dewPoint: data.current.dew_point_2m ?? 0,
    };

    const hourly: HourlyForecast[] = (data.hourly.time as string[]).map((t: string, i: number) => ({
      time: t,
      temperature: data.hourly.temperature_2m[i],
      feelsLike: data.hourly.apparent_temperature[i],
      precipitationProbability: data.hourly.precipitation_probability[i] ?? 0,
      precipitation: data.hourly.precipitation[i] ?? 0,
      weatherCode: data.hourly.weather_code[i],
      windSpeed: data.hourly.wind_speed_10m[i],
      humidity: data.hourly.relative_humidity_2m[i],
      uvIndex: data.hourly.uv_index[i] ?? 0,
      isDay: !!data.hourly.is_day[i],
    }));

    const daily: DailyForecast[] = (data.daily.time as string[]).map((t: string, i: number) => ({
      date: t,
      temperatureMax: data.daily.temperature_2m_max[i],
      temperatureMin: data.daily.temperature_2m_min[i],
      weatherCode: data.daily.weather_code[i],
      precipitationProbabilityMax: data.daily.precipitation_probability_max[i] ?? 0,
      precipitationSum: data.daily.precipitation_sum[i] ?? 0,
      windSpeedMax: data.daily.wind_speed_10m_max[i],
      uvIndexMax: data.daily.uv_index_max[i] ?? 0,
      sunrise: data.daily.sunrise[i],
      sunset: data.daily.sunset[i],
    }));

    return { current, hourly, daily };
  } catch (err: any) {
    console.error("Open-Meteo fetch error:", err.message);
    return null;
  }
}

// ── NWS Forecast Fetch ────────────────────────

async function fetchNwsForecast(): Promise<NwsForecastPeriod[]> {
  const grid = await getNwsGridpoint();
  if (!grid) return [];

  try {
    const res = await fetch(
      `https://api.weather.gov/gridpoints/${grid.office}/${grid.gridX},${grid.gridY}/forecast`,
      {
        headers: {
          "User-Agent": `(${siteConfig.siteUrl}, ${siteConfig.contactEmail})`,
          Accept: "application/geo+json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      console.error(`NWS /forecast error: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const periods = data.properties?.periods || [];

    return periods.map((p: any) => ({
      name: p.name,
      temperature: p.temperature,
      temperatureUnit: p.temperatureUnit,
      windSpeed: p.windSpeed,
      windDirection: p.windDirection,
      shortForecast: p.shortForecast,
      detailedForecast: p.detailedForecast,
      isDaytime: p.isDaytime,
      icon: p.icon,
    }));
  } catch (err: any) {
    console.error("NWS /forecast error:", err.message);
    return [];
  }
}

// ── NWS Alerts Fetch ──────────────────────────

async function fetchNwsAlerts(): Promise<WeatherAlert[]> {
  const { lat, lng } = siteConfig.mapCenter;

  try {
    const res = await fetch(
      `https://api.weather.gov/alerts/active?point=${lat},${lng}`,
      {
        headers: {
          "User-Agent": `(${siteConfig.siteUrl}, ${siteConfig.contactEmail})`,
          Accept: "application/geo+json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) {
      console.error(`NWS /alerts error: HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const features = data.features || [];

    return features.map((f: any) => {
      const props = f.properties;
      const severityMap: Record<string, WeatherAlert["severity"]> = {
        Extreme: "extreme",
        Severe: "severe",
        Moderate: "moderate",
        Minor: "minor",
      };
      return {
        id: f.id || props.id || String(Math.random()),
        severity: severityMap[props.severity] || "unknown",
        event: props.event || "Weather Alert",
        headline: props.headline || props.event || "Weather Alert",
        description: props.description || "",
        source: "nws" as const,
        url: props["@id"] || undefined,
      };
    });
  } catch (err: any) {
    console.error("NWS /alerts error:", err.message);
    return [];
  }
}

// ── Combined NPS + NWS Alerts ─────────────────

async function fetchAllAlerts(): Promise<WeatherAlert[]> {
  const [nwsAlerts, npsAlerts] = await Promise.all([
    fetchNwsAlerts(),
    fetchNpsAlerts(siteConfig.parkCode).catch(() => []),
  ]);

  const npsConverted: WeatherAlert[] = npsAlerts.map((a: any) => ({
    id: `nps-${a.id || Math.random()}`,
    severity: a.category === "Danger" ? "severe" : a.category === "Park Closure" ? "extreme" : "moderate",
    event: a.category || "Park Alert",
    headline: a.title || "Park Alert",
    description: a.description || "",
    source: "nps" as const,
    url: a.url || undefined,
  }));

  return [...nwsAlerts, ...npsConverted];
}

// ── Main Entry Point ──────────────────────────

export async function getWeatherData(): Promise<WeatherData> {
  // Check caches
  const cachedCurrent = getCached<OpenMeteoData>("openmeteo", CACHE_TTL_CURRENT);
  const cachedNws = getCached<NwsForecastPeriod[]>("nws-forecast", CACHE_TTL_NWS);
  const cachedAlerts = getCached<WeatherAlert[]>("alerts", CACHE_TTL_NWS);

  // Fetch what's missing (in parallel)
  const [openMeteo, nwsForecast, alerts] = await Promise.all([
    cachedCurrent ? Promise.resolve(cachedCurrent) : fetchOpenMeteo().then((d) => {
      if (d) setCache("openmeteo", d);
      return d;
    }),
    cachedNws ? Promise.resolve(cachedNws) : fetchNwsForecast().then((d) => {
      setCache("nws-forecast", d);
      return d;
    }),
    cachedAlerts ? Promise.resolve(cachedAlerts) : fetchAllAlerts().then((d) => {
      setCache("alerts", d);
      return d;
    }),
  ]);

  return {
    current: openMeteo?.current || null,
    hourly: openMeteo?.hourly || [],
    daily: openMeteo?.daily || [],
    nwsForecast: nwsForecast || [],
    alerts: alerts || [],
    fetchedAt: Date.now(),
  };
}

// Helper functions (getWeatherCodeLabel, getWeatherIcon, getUvLabel,
// getWindDirectionLabel) are in weather-data.ts for client access.
