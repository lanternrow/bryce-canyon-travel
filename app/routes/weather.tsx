import { useLoaderData } from "react-router";
import type { Route } from "./+types/weather";
import { formatPageTitle, getSiteName } from "../lib/title-template";
import { siteConfig } from "../lib/site-config";
import HeroBanner from "../components/HeroBanner";
import { getWeatherData } from "../lib/weather-api.server";
import { getSystemPage } from "../lib/pages.server";
import { mergeWeatherContent } from "../lib/weather-page-config";
import {
  MONTHLY_AVERAGES,
  SEASONAL_GUIDE,
  TRAIL_WEATHER_TIPS,
  BEST_TIME_RATINGS,
  getPackingRecommendations,
  getCurrentSeason,
  formatTime12h,
  getDayOfWeek,
  getMonthDay,
  getWeatherCodeLabel,
  getWeatherIcon,
  getUvLabel,
  getWindDirectionLabel,
  getTemperatureGradient,
  type WeatherData,
  type WeatherAlert,
  type NwsForecastPeriod,
  type DailyForecast,
  type HourlyForecast,
  type PackingCategory,
} from "../lib/weather-data";

// ── SEO ────────────────────────────────────────

export function meta({ data, matches }: Route.MetaArgs) {
  const siteName = getSiteName(matches);
  const d = data as any;
  const title = d?.seo?.metaTitle || `${siteConfig.parkName} Weather & Forecast — Current Conditions & Seasonal Guide`;
  const description = d?.seo?.metaDescription || `Real-time weather conditions, 16-day forecast, hourly outlook, seasonal guide, and trail safety tips for ${siteConfig.parkName}. Plan your visit with live data.`;
  const ogImage = d?.seo?.ogImage || undefined;

  return [
    { title: formatPageTitle(title, matches) },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: `${siteConfig.siteUrl}/weather` },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${siteConfig.siteUrl}/weather` },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },
    ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),
    { name: "twitter:card", content: ogImage ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    ...(ogImage ? [{ name: "twitter:image", content: ogImage }] : []),
  ];
}

// ── Loader ─────────────────────────────────────

export async function loader({}: Route.LoaderArgs) {
  const [weather, systemPage] = await Promise.all([
    getWeatherData(),
    getSystemPage("weather"),
  ]);

  const pageContent = mergeWeatherContent(systemPage?.content);

  // Build dynamic packing recommendations
  const now = new Date();
  const month = now.getMonth() + 1;
  let packing: PackingCategory[] = [];

  if (weather.current && weather.daily.length > 0) {
    packing = getPackingRecommendations(
      weather.current.temperature,
      weather.daily.map((d) => d.temperatureMax),
      weather.daily.map((d) => d.temperatureMin),
      weather.daily.map((d) => d.precipitationProbabilityMax),
      month
    );
  }

  const seo = {
    metaTitle: systemPage?.meta_title || "",
    metaDescription: systemPage?.meta_description || "",
    ogImage: systemPage?.og_image || "",
  };

  // Compute local time in park timezone
  const localTime = now.toLocaleTimeString("en-US", {
    timeZone: "America/Denver",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return { weather, packing, month, currentSeason: getCurrentSeason(month), hero: pageContent.hero, seo, localTime };
}

// ── Page Component ─────────────────────────────

export default function WeatherPage() {
  const { weather, packing, month, currentSeason, hero, localTime } = useLoaderData<typeof loader>();

  return (
    <>
      <HeroBanner
        title={hero.title}
        subtitle={hero.subtitle}
        imageUrl={hero.bg_image || undefined}
        imageFocalX={hero.bg_image_focal_x}
        imageFocalY={hero.bg_image_focal_y}
        gradientFrom={hero.gradient_from}
        gradientVia={hero.gradient_via}
        gradientTo={hero.gradient_to}
        gradientOpacity={hero.gradient_opacity}
        gradientDirection={hero.gradient_direction}
        height={hero.height}
        titleSizeMobile={hero.title_size_mobile}
        titleSizeDesktop={hero.title_size_desktop}
        titleColor={hero.title_color}
        subtitleColor={hero.subtitle_color}
      />

      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-14">
        {/* Weather Alerts */}
        {weather.alerts.length > 0 && <AlertsBanner alerts={weather.alerts} />}

        {/* Current Conditions — Hero Card */}
        {weather.current ? (
          <CurrentConditions
            current={weather.current}
            today={weather.daily[0] || null}
            hourly={weather.hourly.slice(0, 6)}
            fetchedAt={weather.fetchedAt}
            localTime={localTime}
          />
        ) : (
          <UnavailableCard title="Current Conditions" />
        )}

        {/* Hourly Forecast */}
        {weather.hourly.length > 0 && (
          <HourlyTimeline hours={weather.hourly} />
        )}

        {/* 16-Day Forecast */}
        {weather.daily.length > 0 && (
          <DailyForecastSection days={weather.daily} />
        )}

        {/* NWS Detailed Forecast */}
        {weather.nwsForecast.length > 0 && (
          <NwsDetailedForecast periods={weather.nwsForecast} />
        )}

        {/* Sunrise & Sunset */}
        {weather.daily.length > 0 && (
          <SunriseSunsetSection days={weather.daily} />
        )}

        {/* What to Pack Right Now */}
        {packing.length > 0 && <PackingSection packing={packing} />}

        {/* Seasonal Guide */}
        <SeasonalGuideSection currentSeason={currentSeason} />

        {/* Historical Averages */}
        <HistoricalAverages currentMonth={month} />

        {/* Best Time to Visit */}
        <BestTimeToVisit currentMonth={month} />

        {/* Trail Weather Tips */}
        <TrailWeatherTipsSection />

        {/* Data Attribution */}
        <footer className="text-center text-sm text-gray-400 pt-6 border-t border-gray-100">
          <p>
            Weather data from{" "}
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">Open-Meteo</a>
            {" · "}
            Forecast by{" "}
            <a href="https://www.weather.gov/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">National Weather Service</a>
            {" · "}
            Park alerts from{" "}
            <a href="https://www.nps.gov/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">NPS</a>
          </p>
        </footer>
      </div>
    </>
  );
}

// ── Section Components ─────────────────────────

function SectionHeading({
  children,
  subtitle,
  accentColor = "bg-primary",
}: {
  children: React.ReactNode;
  subtitle?: string;
  accentColor?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-1">
        <div className={`w-1 h-8 rounded-full ${accentColor}`} />
        <h2 className="text-2xl sm:text-3xl font-bold text-dark">{children}</h2>
      </div>
      {subtitle && <p className="text-gray-500 mt-1 ml-[19px]">{subtitle}</p>}
    </div>
  );
}

function UnavailableCard({ title }: { title: string }) {
  return (
    <section>
      <SectionHeading>{title}</SectionHeading>
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-8 text-center text-gray-500">
        Weather data is temporarily unavailable. Please check back shortly.
      </div>
    </section>
  );
}

// ── Alerts Banner ──────────────────────────────

function AlertsBanner({ alerts }: { alerts: WeatherAlert[] }) {
  const severityStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    extreme: { bg: "bg-red-50", border: "border-red-500", text: "text-red-900", icon: "🚨" },
    severe: { bg: "bg-red-50", border: "border-red-400", text: "text-red-800", icon: "⚠️" },
    moderate: { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-900", icon: "⚠️" },
    minor: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-900", icon: "ℹ️" },
    unknown: { bg: "bg-gray-50", border: "border-gray-300", text: "text-gray-800", icon: "ℹ️" },
  };

  return (
    <section className="space-y-3">
      {alerts.map((alert) => {
        const style = severityStyles[alert.severity] || severityStyles.unknown;
        return (
          <div
            key={alert.id}
            className={`${style.bg} ${style.border} ${style.text} border-l-4 rounded-r-xl p-4 shadow-sm`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl flex-shrink-0 mt-0.5">{style.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base">{alert.event}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/60 uppercase tracking-widest font-semibold">
                    {alert.source === "nps" ? "Park Alert" : "Weather Alert"}
                  </span>
                </div>
                <p className="text-sm mt-1 font-medium leading-relaxed">{alert.headline}</p>
                {alert.description && (
                  <p className="text-sm mt-2 opacity-75 line-clamp-3 leading-relaxed">{alert.description}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ── Current Conditions — Premium Hero Card ─────

function CurrentConditions({
  current,
  today,
  hourly,
  fetchedAt,
  localTime,
}: {
  current: NonNullable<WeatherData["current"]>;
  today: DailyForecast | null;
  hourly: HourlyForecast[];
  fetchedAt: number;
  localTime: string;
}) {
  const uv = getUvLabel(current.uvIndex);
  const updatedAgo = Math.round((Date.now() - fetchedAt) / 60000);
  const tempRounded = Math.round(current.temperature);

  return (
    <section>
      <div className={`rounded-2xl overflow-hidden shadow-xl bg-gradient-to-br ${getTemperatureGradient(tempRounded)}`}>
        {/* Main hero area */}
        <div className="relative px-6 sm:px-10 pt-8 pb-6">
          {/* Background decorative circles */}
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/5 -translate-y-1/3 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/5 translate-y-1/3 -translate-x-1/4" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            {/* Left: Temp + condition */}
            <div className="flex items-start gap-5">
              <span className="text-7xl sm:text-8xl drop-shadow-lg">{getWeatherIcon(current.weatherCode, current.isDay)}</span>
              <div>
                <div className="flex items-start">
                  <span className="text-7xl sm:text-8xl font-extrabold text-white leading-none tracking-tight">
                    {tempRounded}°
                  </span>
                </div>
                <div className="text-white/70 text-base mt-2 font-medium">
                  Feels like {Math.round(current.feelsLike)}°F
                </div>
                <div className="text-white text-xl font-semibold mt-1">
                  {getWeatherCodeLabel(current.weatherCode)}
                </div>
              </div>
            </div>

            {/* Right: High/Low + Sun */}
            <div className="sm:text-right space-y-2">
              <div className="text-sm uppercase tracking-widest text-white/50 font-semibold">
                {siteConfig.parkName}
              </div>
              {today && (
                <div className="flex sm:justify-end items-center gap-4 text-white/90">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-red-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 4.414l-3.293 3.293a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    <span className="text-lg font-bold">{Math.round(today.temperatureMax)}°</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-blue-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L10 15.586l3.293-3.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span className="text-lg font-bold">{Math.round(today.temperatureMin)}°</span>
                  </div>
                </div>
              )}
              {today && (
                <div className="flex sm:justify-end gap-4 text-sm text-white/70">
                  <span>☀️ {formatTime12h(today.sunrise)}</span>
                  <span>🌙 {formatTime12h(today.sunset)}</span>
                </div>
              )}
              <div className="text-xs text-white/40 pt-1">
                Updated {updatedAgo <= 1 ? "just now" : `${updatedAgo} min ago`}
              </div>
            </div>
          </div>

          {/* Mini hourly preview */}
          {hourly.length > 0 && (
            <div className="relative z-10 mt-6 pt-5 border-t border-white/10">
              <div className="flex justify-between gap-2">
                {hourly.map((h, i) => {
                  const d = new Date(h.time);
                  const hour = d.getHours();
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-[11px] text-white/50 font-medium">
                        {i === 0 ? "Now" : `${hour > 12 ? hour - 12 : hour || 12}${hour >= 12 ? "p" : "a"}`}
                      </span>
                      <span className="text-lg">{getWeatherIcon(h.weatherCode, h.isDay)}</span>
                      <span className="text-sm font-bold text-white">{Math.round(h.temperature)}°</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black/20">
          <StatCell icon="💨" label="Wind" value={`${Math.round(current.windSpeed)} mph ${getWindDirectionLabel(current.windDirection)}`} sub={`Gusts ${Math.round(current.windGusts)} mph`} />
          <StatCell icon="💧" label="Humidity" value={`${current.humidity}%`} />
          <StatCell icon="☀️" label="UV Index" value={`${Math.round(current.uvIndex)}`} badge={uv} />
          <StatCell icon="👁️" label="Visibility" value={`${current.visibility} mi`} />
          <StatCell icon="☁️" label="Cloud Cover" value={`${current.cloudCover}%`} />
          <StatCell icon="🌡️" label="Dew Point" value={`${Math.round(current.dewPoint)}°F`} />
          <StatCell icon="🌧️" label="Precipitation" value={`${current.precipitation} in`} />
          <StatCell icon="🕐" label="Local Time" value={localTime} />
        </div>
      </div>
    </section>
  );
}

function StatCell({
  icon,
  label,
  value,
  sub,
  badge,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  badge?: { label: string; color: string };
}) {
  return (
    <div className="bg-white/10 backdrop-blur-sm p-4 hover:bg-white/15 transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm">{icon}</span>
        <span className="text-[11px] text-white/50 uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="text-lg font-bold text-white flex items-center gap-2">
        {value}
        {badge && (
          <span className={`text-[10px] text-white px-2 py-0.5 rounded-full ${badge.color} font-semibold`}>
            {badge.label}
          </span>
        )}
      </div>
      {sub && <div className="text-[11px] text-white/40 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Hourly Timeline ────────────────────────────

function HourlyTimeline({ hours }: { hours: HourlyForecast[] }) {
  // Find temp range for background gradients
  const temps = hours.map((h) => h.temperature);
  const minT = Math.min(...temps);
  const maxT = Math.max(...temps);
  const rangeT = maxT - minT || 1;

  return (
    <section>
      <SectionHeading subtitle="Hour-by-hour outlook for the next 48 hours" accentColor="bg-sky">
        Hourly Forecast
      </SectionHeading>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <div className="flex min-w-max">
            {hours.map((h, i) => {
              const d = new Date(h.time);
              const hour = d.getHours();
              const isNow = i === 0;
              const isMidnight = hour === 0;
              const warmth = (h.temperature - minT) / rangeT;

              return (
                <div
                  key={i}
                  className={`flex flex-col items-center px-3 py-4 min-w-[72px] border-r border-gray-50 last:border-r-0 transition-colors
                    ${isNow ? "bg-primary/5 border-b-2 border-b-primary" : ""}
                    ${isMidnight && !isNow ? "border-l-2 border-l-gray-200" : ""}
                  `}
                >
                  <span className={`text-xs font-semibold mb-2 ${isNow ? "text-primary" : "text-gray-400"}`}>
                    {isNow ? "Now" : hour === 0 ? getDayOfWeek(h.time.split("T")[0]) : `${hour > 12 ? hour - 12 : hour || 12}${hour >= 12 ? "p" : "a"}`}
                  </span>

                  <span className="text-2xl mb-1.5">{getWeatherIcon(h.weatherCode, h.isDay)}</span>

                  <span className={`text-base font-bold mb-1 ${isNow ? "text-primary" : "text-dark"}`}>
                    {Math.round(h.temperature)}°
                  </span>

                  {/* Temperature indicator dot */}
                  <div className="w-6 h-1.5 rounded-full mb-1.5" style={{
                    background: `linear-gradient(to right, #6ba3c7, #d4a574, #c1440e)`,
                    opacity: 0.3 + warmth * 0.7,
                  }} />

                  {h.precipitationProbability > 0 ? (
                    <span className={`text-[11px] font-semibold ${h.precipitationProbability > 50 ? "text-blue-600" : "text-blue-400"}`}>
                      💧 {h.precipitationProbability}%
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-300">—</span>
                  )}

                  <span className="text-[10px] text-gray-400 mt-1">{Math.round(h.windSpeed)} mph</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 16-Day Forecast ────────────────────────────

function DailyForecastSection({ days }: { days: DailyForecast[] }) {
  const allTemps = days.flatMap((d) => [d.temperatureMax, d.temperatureMin]);
  const minTemp = Math.min(...allTemps);
  const maxTemp = Math.max(...allTemps);
  const range = maxTemp - minTemp || 1;

  return (
    <section>
      <SectionHeading subtitle={`${days.length}-day outlook for ${siteConfig.parkName}`} accentColor="bg-sand">
        Extended Forecast
      </SectionHeading>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
        {days.map((d, i) => {
          const lowPct = ((d.temperatureMin - minTemp) / range) * 100;
          const highPct = ((d.temperatureMax - minTemp) / range) * 100;
          const isToday = i === 0;

          return (
            <div
              key={d.date}
              className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 transition-colors hover:bg-gray-50/50 ${
                isToday ? "bg-primary/[0.03]" : ""
              }`}
            >
              {/* Day */}
              <div className="w-16 sm:w-20 flex-shrink-0">
                <div className={`text-sm font-bold ${isToday ? "text-primary" : "text-dark"}`}>
                  {isToday ? "Today" : getDayOfWeek(d.date)}
                </div>
                <div className="text-xs text-gray-400">{getMonthDay(d.date)}</div>
              </div>

              {/* Icon */}
              <span className="text-2xl flex-shrink-0">{getWeatherIcon(d.weatherCode, true)}</span>

              {/* Precip */}
              <div className="w-10 text-center flex-shrink-0">
                {d.precipitationProbabilityMax > 0 ? (
                  <span className={`text-xs font-semibold ${d.precipitationProbabilityMax > 50 ? "text-blue-600" : "text-blue-400"}`}>
                    {d.precipitationProbabilityMax}%
                  </span>
                ) : (
                  <span className="text-xs text-gray-200">—</span>
                )}
              </div>

              {/* Temp bar */}
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-sm text-gray-400 w-8 text-right flex-shrink-0 tabular-nums">
                  {Math.round(d.temperatureMin)}°
                </span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
                  <div
                    className="absolute h-full rounded-full"
                    style={{
                      left: `${lowPct}%`,
                      width: `${Math.max(highPct - lowPct, 2)}%`,
                      background: `linear-gradient(to right, #6ba3c7, #d4a574, #c1440e)`,
                    }}
                  />
                </div>
                <span className="text-sm font-bold text-dark w-8 flex-shrink-0 tabular-nums">
                  {Math.round(d.temperatureMax)}°
                </span>
              </div>

              {/* Wind */}
              <div className="hidden sm:flex items-center gap-1 w-20 justify-end flex-shrink-0">
                <span className="text-xs text-gray-400">💨</span>
                <span className="text-xs text-gray-400">{Math.round(d.windSpeedMax)} mph</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── NWS Detailed Forecast ──────────────────────

function NwsDetailedForecast({ periods }: { periods: NwsForecastPeriod[] }) {
  const shown = periods.slice(0, 8);

  return (
    <section>
      <SectionHeading subtitle="Official narrative forecast from the National Weather Service" accentColor="bg-sky">
        NWS Detailed Forecast
      </SectionHeading>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-100">
        {shown.map((p, i) => (
          <div
            key={i}
            className={`p-5 sm:p-6 transition-colors hover:bg-gray-50/50 ${
              !p.isDaytime ? "bg-slate-50/50" : ""
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 text-center w-[130px]">
                <div className={`text-sm font-bold ${p.isDaytime ? "text-dark" : "text-gray-500"}`}>{p.name}</div>
                <div className="text-3xl font-extrabold text-dark mt-1">
                  {p.temperature}°
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {p.windSpeed} {p.windDirection}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-2 mb-2">
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                    p.isDaytime ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800"
                  }`}>
                    {p.shortForecast}
                  </span>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {p.detailedForecast}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3 text-right">
        Source:{" "}
        <a href="https://www.weather.gov/" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">
          weather.gov
        </a>
      </p>
    </section>
  );
}

// ── Sunrise & Sunset ───────────────────────────

function SunriseSunsetSection({ days }: { days: DailyForecast[] }) {
  const next7 = days.slice(0, 7);
  const today = days[0];
  if (!today) return null;

  const sunriseDate = new Date(today.sunrise);
  const sunsetDate = new Date(today.sunset);
  const dayLengthMs = sunsetDate.getTime() - sunriseDate.getTime();
  const dayHours = Math.floor(dayLengthMs / 3600000);
  const dayMinutes = Math.round((dayLengthMs % 3600000) / 60000);
  const totalMinutes = dayHours * 60 + dayMinutes;

  // Golden hour: ~1 hour after sunrise, ~1 hour before sunset
  const goldenMorningEnd = new Date(sunriseDate.getTime() + 60 * 60 * 1000);
  const goldenEveningStart = new Date(sunsetDate.getTime() - 60 * 60 * 1000);

  // Sun arc progress (% of daylight elapsed)
  const now = new Date();
  const sunProgress = Math.max(0, Math.min(100,
    ((now.getTime() - sunriseDate.getTime()) / dayLengthMs) * 100
  ));

  return (
    <section>
      <SectionHeading subtitle="Plan your hikes and photography around the light" accentColor="bg-sand">
        Sunrise & Sunset
      </SectionHeading>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Today's detail card */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          {/* Sun arc visualization */}
          <div className="bg-gradient-to-b from-sky-100/50 to-amber-50/30 px-6 pt-6 pb-4">
            <div className="relative h-20 mb-2">
              {/* Arc path */}
              <svg viewBox="0 0 200 80" className="w-full h-full" preserveAspectRatio="xMidYMax meet">
                {/* Horizon line */}
                <line x1="10" y1="70" x2="190" y2="70" stroke="#e5e7eb" strokeWidth="1" />
                {/* Arc */}
                <path d="M 10 70 Q 100 -10 190 70" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="4 3" opacity="0.4" />
                {/* Filled arc to current position */}
                {sunProgress > 0 && sunProgress < 100 && (
                  <>
                    <circle
                      cx={10 + (180 * sunProgress / 100)}
                      cy={70 - Math.sin((sunProgress / 100) * Math.PI) * 70}
                      r="6"
                      fill="#f59e0b"
                      className="drop-shadow"
                    />
                    <circle
                      cx={10 + (180 * sunProgress / 100)}
                      cy={70 - Math.sin((sunProgress / 100) * Math.PI) * 70}
                      r="10"
                      fill="#f59e0b"
                      opacity="0.2"
                    />
                  </>
                )}
                {/* Sunrise marker */}
                <text x="10" y="65" textAnchor="middle" fontSize="10" fill="#9ca3af">☀️</text>
                {/* Sunset marker */}
                <text x="190" y="65" textAnchor="middle" fontSize="10" fill="#9ca3af">🌙</text>
              </svg>
            </div>
            <div className="flex justify-between text-sm">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Sunrise</div>
                <div className="font-bold text-dark text-lg">{formatTime12h(today.sunrise)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Day Length</div>
                <div className="font-bold text-dark text-lg">{dayHours}h {dayMinutes}m</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Sunset</div>
                <div className="font-bold text-dark text-lg">{formatTime12h(today.sunset)}</div>
              </div>
            </div>
          </div>

          {/* Golden hour */}
          <div className="px-6 py-4 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <span>📷</span>
              <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Golden Hour</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-amber-50 rounded-xl px-4 py-3 text-center">
                <div className="text-[11px] text-amber-600 font-semibold uppercase">Morning</div>
                <div className="text-sm font-bold text-dark mt-0.5">
                  {formatTime12h(today.sunrise)} – {formatTime12h(goldenMorningEnd.toISOString())}
                </div>
              </div>
              <div className="bg-orange-50 rounded-xl px-4 py-3 text-center">
                <div className="text-[11px] text-orange-600 font-semibold uppercase">Evening</div>
                <div className="text-sm font-bold text-dark mt-0.5">
                  {formatTime12h(goldenEveningStart.toISOString())} – {formatTime12h(today.sunset)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 7-day table */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-dark">This Week's Sun Times</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {next7.map((d, i) => {
              const sDate = new Date(d.sunrise);
              const eDate = new Date(d.sunset);
              const len = eDate.getTime() - sDate.getTime();
              const h = Math.floor(len / 3600000);
              const m = Math.round((len % 3600000) / 60000);

              return (
                <div key={d.date} className={`flex items-center justify-between px-6 py-3 text-sm ${i === 0 ? "bg-primary/[0.03]" : "hover:bg-gray-50/50"}`}>
                  <span className={`w-12 ${i === 0 ? "font-bold text-primary" : "text-gray-500"}`}>
                    {i === 0 ? "Today" : getDayOfWeek(d.date)}
                  </span>
                  <span className={`tabular-nums ${i === 0 ? "font-semibold text-dark" : "text-gray-600"}`}>
                    ☀️ {formatTime12h(d.sunrise)}
                  </span>
                  <span className={`tabular-nums ${i === 0 ? "font-semibold text-dark" : "text-gray-600"}`}>
                    🌙 {formatTime12h(d.sunset)}
                  </span>
                  <span className="text-xs text-gray-400 w-14 text-right tabular-nums">{h}h {m}m</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── What to Pack ───────────────────────────────

function PackingSection({ packing }: { packing: PackingCategory[] }) {
  const categoryColors: Record<string, string> = {
    Clothing: "from-primary/10 to-primary/5 border-primary/20",
    "Sun Protection": "from-amber-100/50 to-amber-50/30 border-amber-200/50",
    "Hydration & Nutrition": "from-sky/10 to-sky/5 border-sky/20",
    Footwear: "from-stone/10 to-stone/5 border-stone/20",
    "Safety & Gear": "from-sage/10 to-sage/5 border-sage/20",
  };

  return (
    <section>
      <SectionHeading subtitle="Personalized recommendations based on the current forecast" accentColor="bg-sage">
        What to Pack Right Now
      </SectionHeading>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {packing.map((cat) => (
          <div
            key={cat.category}
            className={`bg-gradient-to-br ${categoryColors[cat.category] || "from-gray-50 to-white border-gray-200"} border rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <span className="text-2xl">{cat.icon}</span>
              <h3 className="font-bold text-dark">{cat.category}</h3>
            </div>
            <ul className="space-y-2">
              {cat.items.map((item, i) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2.5 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Seasonal Guide ─────────────────────────────

function SeasonalGuideSection({ currentSeason }: { currentSeason: string }) {
  const seasonConfig: Record<string, {
    gradient: string;
    accent: string;
    tagBg: string;
    headerIcon: string;
  }> = {
    Spring: { gradient: "from-emerald-50 to-green-50/50", accent: "text-emerald-700", tagBg: "bg-emerald-100 text-emerald-700", headerIcon: "🌸" },
    Summer: { gradient: "from-amber-50 to-orange-50/50", accent: "text-amber-700", tagBg: "bg-amber-100 text-amber-700", headerIcon: "☀️" },
    Fall: { gradient: "from-orange-50 to-red-50/50", accent: "text-orange-700", tagBg: "bg-orange-100 text-orange-700", headerIcon: "🍂" },
    Winter: { gradient: "from-blue-50 to-indigo-50/50", accent: "text-blue-700", tagBg: "bg-blue-100 text-blue-700", headerIcon: "❄️" },
  };

  return (
    <section>
      <SectionHeading subtitle={`What to expect each season at ${siteConfig.parkName}`} accentColor="bg-sage">
        Seasonal Guide
      </SectionHeading>
      <div className="grid sm:grid-cols-2 gap-5">
        {SEASONAL_GUIDE.map((s) => {
          const isCurrent = s.season === currentSeason;
          const cfg = seasonConfig[s.season] || seasonConfig.Spring;

          return (
            <div
              key={s.season}
              className={`rounded-2xl overflow-hidden border transition-all ${
                isCurrent
                  ? "border-primary/30 shadow-lg ring-1 ring-primary/10"
                  : "border-gray-200 shadow-sm hover:shadow-md"
              }`}
            >
              {/* Header */}
              <div className={`bg-gradient-to-r ${cfg.gradient} px-5 py-4`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{cfg.headerIcon}</span>
                    <h3 className={`text-xl font-bold ${cfg.accent}`}>{s.season}</h3>
                    {isCurrent && (
                      <span className="text-[10px] bg-dark text-white px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider">Now</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{s.months}</span>
                </div>
                <div className="flex gap-4 text-xs text-gray-500 mt-2">
                  <span>High: {s.avgHighRange}</span>
                  <span>Low: {s.avgLowRange}</span>
                  <span>Crowds: {s.crowdLevel}</span>
                </div>
              </div>

              {/* Content */}
              <div className="bg-white px-5 py-4 space-y-4">
                <p className="text-sm text-gray-600 leading-relaxed">{s.description}</p>

                <div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Best For</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.bestFor.map((a) => (
                      <span key={a} className={`text-xs ${cfg.tagBg} px-2.5 py-1 rounded-full font-medium`}>{a}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Packing Essentials</div>
                  <ul className="text-xs text-gray-500 space-y-1">
                    {s.packingEssentials.slice(0, 4).map((p, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Historical Averages ────────────────────────

function HistoricalAverages({ currentMonth }: { currentMonth: number }) {
  const maxHigh = Math.max(...MONTHLY_AVERAGES.map((m) => m.highF));
  const maxPrecip = Math.max(...MONTHLY_AVERAGES.map((m) => m.precipIn));

  return (
    <section>
      <SectionHeading subtitle={`Typical conditions by month at ${siteConfig.parkName}`} accentColor="bg-stone">
        Historical Monthly Averages
      </SectionHeading>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Temperature chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-sm font-bold text-dark mb-5 flex items-center gap-2">
            🌡️ Average Temperature (°F)
          </h3>
          <div className="space-y-2.5">
            {MONTHLY_AVERAGES.map((m, i) => {
              const isCurrent = i + 1 === currentMonth;
              return (
                <div key={m.month} className="flex items-center gap-2">
                  <span className={`text-xs w-8 text-right font-medium ${isCurrent ? "font-bold text-primary" : "text-gray-400"}`}>
                    {m.month.slice(0, 3)}
                  </span>
                  <div className="flex-1 flex items-center gap-1 h-5">
                    <div style={{ width: `${(m.lowF / maxHigh) * 100}%` }} />
                    <span className="text-[10px] text-gray-400 w-7 text-right tabular-nums">{m.lowF}°</span>
                    <div
                      className={`h-4 rounded-full ${isCurrent ? "shadow-sm" : ""}`}
                      style={{
                        width: `${((m.highF - m.lowF) / maxHigh) * 100}%`,
                        background: isCurrent
                          ? "linear-gradient(to right, #6ba3c7, #c1440e)"
                          : "linear-gradient(to right, #6ba3c780, #c1440e60)",
                      }}
                    />
                    <span className={`text-[10px] w-8 tabular-nums ${isCurrent ? "font-bold text-primary" : "text-gray-500"}`}>{m.highF}°</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Precipitation chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm">
          <h3 className="text-sm font-bold text-dark mb-5 flex items-center gap-2">
            🌧️ Average Precipitation (inches)
          </h3>
          <div className="flex items-end justify-between gap-1.5 h-48">
            {MONTHLY_AVERAGES.map((m, i) => {
              const isCurrent = i + 1 === currentMonth;
              const height = (m.precipIn / maxPrecip) * 100;
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                  <span className={`text-[10px] tabular-nums ${isCurrent ? "font-bold text-sky" : "text-gray-400"}`}>{m.precipIn}"</span>
                  <div className="w-full flex items-end flex-1">
                    <div
                      className={`w-full rounded-t-md transition-all ${isCurrent ? "bg-sky shadow-sm" : "bg-sky/30"}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className={`text-[10px] ${isCurrent ? "font-bold text-primary" : "text-gray-400"}`}>
                    {m.month.slice(0, 3)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Best Time to Visit ─────────────────────────

function BestTimeToVisit({ currentMonth }: { currentMonth: number }) {
  const stars = (n: number) => {
    const full = Math.floor(n);
    return (
      <span className="text-xs tracking-tight whitespace-nowrap">
        {Array.from({ length: full }, (_, i) => (
          <span key={i} className="text-primary">★</span>
        ))}
        {Array.from({ length: 5 - full }, (_, i) => (
          <span key={i} className="text-gray-200">★</span>
        ))}
      </span>
    );
  };

  return (
    <section>
      <SectionHeading subtitle="Month-by-month ratings for planning your trip" accentColor="bg-primary">
        Best Time to Visit
      </SectionHeading>
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-bold text-dark">Month</th>
                <th className="text-center px-3 py-3 font-bold text-dark">Weather</th>
                <th className="text-center px-3 py-3 font-bold text-dark">Crowds</th>
                <th className="text-center px-3 py-3 font-bold text-dark">Activities</th>
                <th className="text-center px-3 py-3 font-bold text-dark">Overall</th>
                <th className="text-left px-4 py-3 font-bold text-dark hidden sm:table-cell">Note</th>
              </tr>
            </thead>
            <tbody>
              {BEST_TIME_RATINGS.map((r, i) => {
                const isCurrent = i + 1 === currentMonth;
                return (
                  <tr
                    key={r.month}
                    className={`border-b border-gray-50 transition-colors hover:bg-gray-50/50 ${isCurrent ? "bg-primary/[0.03]" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className={isCurrent ? "text-primary font-bold" : "text-dark font-medium"}>
                        {r.month}
                      </span>
                      {isCurrent && (
                        <span className="ml-2 text-[9px] bg-dark text-white px-2 py-0.5 rounded-full align-middle uppercase tracking-wider font-semibold">Now</span>
                      )}
                    </td>
                    <td className="text-center px-3 py-3">{stars(r.weather)}</td>
                    <td className="text-center px-3 py-3">{stars(r.crowds)}</td>
                    <td className="text-center px-3 py-3">{stars(r.activities)}</td>
                    <td className="text-center px-3 py-3">{stars(r.overall)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">{r.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 bg-gray-50/80 text-xs text-gray-400">
          Crowds rating: ★★★★★ = fewest crowds · Based on historical data
        </div>
      </div>
    </section>
  );
}

// ── Trail Weather Tips ─────────────────────────

function TrailWeatherTipsSection() {
  const severityConfig: Record<string, { border: string; bg: string; iconBg: string }> = {
    danger: { border: "border-l-red-500", bg: "bg-red-50/50", iconBg: "bg-red-100" },
    caution: { border: "border-l-amber-500", bg: "bg-amber-50/50", iconBg: "bg-amber-100" },
    info: { border: "border-l-sky", bg: "bg-sky/5", iconBg: "bg-sky/20" },
  };

  return (
    <section>
      <SectionHeading subtitle="Essential safety information for Bryce Canyon's trails" accentColor="bg-red-500">
        Trail Weather Considerations
      </SectionHeading>
      <div className="grid sm:grid-cols-2 gap-5">
        {TRAIL_WEATHER_TIPS.map((tip) => {
          const cfg = severityConfig[tip.severity] || severityConfig.info;
          return (
            <div
              key={tip.title}
              className={`border border-gray-200 ${cfg.border} border-l-4 rounded-2xl overflow-hidden ${cfg.bg} shadow-sm hover:shadow-md transition-shadow`}
            >
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`w-10 h-10 rounded-xl ${cfg.iconBg} flex items-center justify-center text-xl`}>
                    {tip.icon}
                  </span>
                  <h3 className="font-bold text-dark">{tip.title}</h3>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{tip.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
