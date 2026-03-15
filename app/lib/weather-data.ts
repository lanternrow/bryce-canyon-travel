// ============================================
// WEATHER DATA — Static reference data for the
// weather page: historical averages, seasonal
// guide, trail tips, and packing logic.
// ============================================

export interface MonthlyAverage {
  month: string;
  highF: number;
  lowF: number;
  precipIn: number;
  snowIn: number;
  sunHours: number;
}

// ┌─────────────────────────────────────────────────────────┐
// │ Bryce Canyon National Park historical averages          │
// │ Based on Bryce Canyon elevation ~8,000 ft               │
// │ Source: NOAA / weather.gov / Western Regional Climate   │
// └─────────────────────────────────────────────────────────┘
export const MONTHLY_AVERAGES: MonthlyAverage[] = [
  { month: "January", highF: 30, lowF: 9, precipIn: 1.4, snowIn: 18.2, sunHours: 9.5 },
  { month: "February", highF: 33, lowF: 12, precipIn: 1.2, snowIn: 14.5, sunHours: 10.5 },
  { month: "March", highF: 41, lowF: 19, precipIn: 1.3, snowIn: 11.0, sunHours: 12.0 },
  { month: "April", highF: 50, lowF: 26, precipIn: 1.0, snowIn: 6.5, sunHours: 13.2 },
  { month: "May", highF: 60, lowF: 33, precipIn: 0.8, snowIn: 1.5, sunHours: 14.2 },
  { month: "June", highF: 71, lowF: 40, precipIn: 0.5, snowIn: 0.0, sunHours: 14.8 },
  { month: "July", highF: 77, lowF: 47, precipIn: 1.4, snowIn: 0.0, sunHours: 14.5 },
  { month: "August", highF: 74, lowF: 45, precipIn: 1.8, snowIn: 0.0, sunHours: 13.7 },
  { month: "September", highF: 66, lowF: 37, precipIn: 1.3, snowIn: 0.0, sunHours: 12.5 },
  { month: "October", highF: 54, lowF: 27, precipIn: 1.4, snowIn: 3.5, sunHours: 11.2 },
  { month: "November", highF: 40, lowF: 17, precipIn: 1.1, snowIn: 10.0, sunHours: 10.0 },
  { month: "December", highF: 30, lowF: 9, precipIn: 1.2, snowIn: 16.5, sunHours: 9.3 },
];

export interface SeasonGuide {
  season: string;
  months: string;
  monthNumbers: number[];
  description: string;
  highlights: string[];
  crowdLevel: string;
  bestFor: string[];
  packingEssentials: string[];
  avgHighRange: string;
  avgLowRange: string;
}

// ┌─────────────────────────────────────────────────────────┐
// │ Bryce Canyon seasonal guide — park-specific content     │
// └─────────────────────────────────────────────────────────┘
export const SEASONAL_GUIDE: SeasonGuide[] = [
  {
    season: "Spring",
    months: "March – May",
    monthNumbers: [3, 4, 5],
    description:
      "Spring at Bryce Canyon is a transitional season of dramatic contrasts. Snow-covered hoodoos gradually give way to wildflower blooms across the plateau. Weather is highly variable — sunny mornings can quickly turn to snow squalls. The Rim Trail and many viewpoints become accessible as snow melts, but some trails below the rim may remain icy well into April. Spring brings some of the best photography conditions with fresh snow on red rock formations.",
    highlights: [
      "Snow-dusted hoodoos create stunning photography",
      "Wildflower blooms across the plateau (late May)",
      "Moderate crowds with increasing daylight",
      "Prairie dogs emerge from winter burrows",
      "Stargazing improves as skies clear",
    ],
    crowdLevel: "Moderate",
    bestFor: ["Photography", "Rim Trail walks", "Stargazing", "Wildlife viewing", "Scenic drives"],
    packingEssentials: ["Heavy layers for temperature swings", "Waterproof jacket", "Microspikes for icy trails", "Sunscreen SPF 50+", "Warm hat and gloves"],
    avgHighRange: "41–60°F",
    avgLowRange: "19–33°F",
  },
  {
    season: "Summer",
    months: "June – August",
    monthNumbers: [6, 7, 8],
    description:
      "Summer is Bryce Canyon's busiest season, but the high elevation (8,000–9,000 ft) keeps temperatures 20–30°F cooler than lower desert parks. Days are warm and pleasant for hiking, though afternoon thunderstorms are common during monsoon season (July–August). Lightning is a real hazard along exposed rim trails. The park's famous hoodoo amphitheaters are fully accessible, and all trails are open. The dark skies make summer nights ideal for the park's astronomy programs.",
    highlights: [
      "All trails fully open and snow-free",
      "Pleasant daytime hiking temperatures",
      "NPS astronomy programs and star parties",
      "Dramatic monsoon thunderstorms (photography)",
      "Full shuttle system in operation",
    ],
    crowdLevel: "Very High",
    bestFor: ["Hiking below the rim", "Stargazing programs", "Queens Garden/Navajo Loop", "Fairyland Loop", "Photography"],
    packingEssentials: ["Layered clothing (cool mornings, warm afternoons)", "Rain jacket for afternoon storms", "Minimum 2 liters water per person", "Wide-brim hat and sunscreen", "Sturdy hiking boots with ankle support"],
    avgHighRange: "71–77°F",
    avgLowRange: "40–47°F",
  },
  {
    season: "Fall",
    months: "September – November",
    monthNumbers: [9, 10, 11],
    description:
      "Fall is arguably the best time to visit Bryce Canyon. Crowds thin dramatically after Labor Day while weather remains excellent for hiking. The surrounding Ponderosa pine and aspen forests explode with golden fall color against the red and orange hoodoos. Clear autumn skies provide exceptional visibility — on clear days you can see over 100 miles from the rim. October's first dustings of snow on the hoodoos create magical photography opportunities.",
    highlights: [
      "Spectacular fall foliage (aspens + Ponderosa pines)",
      "Fewest crowds with excellent weather",
      "100+ mile visibility on clear days",
      "First snowfall on hoodoos (October/November)",
      "Perfect hiking temperatures",
    ],
    crowdLevel: "Moderate (Sep) to Low (Nov)",
    bestFor: ["Hiking all trails", "Photography", "Under-the-Rim Trail", "Scenic drives", "Solitude"],
    packingEssentials: ["Warm layers (cold mornings, mild afternoons)", "Insulated jacket for evenings", "Sunscreen", "Sturdy hiking boots", "Camera for fall colors"],
    avgHighRange: "40–66°F",
    avgLowRange: "17–37°F",
  },
  {
    season: "Winter",
    months: "December – February",
    monthNumbers: [12, 1, 2],
    description:
      "Winter transforms Bryce Canyon into a snow-covered wonderland. The contrast of white snow against vivid orange and red hoodoos is unlike anything else in the national park system. The park remains open year-round, but road access is limited — only the road to Bryce Point stays plowed. Rim Trail sections and some upper trails are accessible with proper traction devices. Cross-country skiing and snowshoeing are popular on the rim. Expect bitterly cold temperatures, especially at night when it regularly drops below zero.",
    highlights: [
      "Snow-covered hoodoos — world-class photography",
      "Fewest visitors of any season",
      "Cross-country skiing and snowshoeing",
      "Incredibly dark skies for stargazing",
      "Free from shuttle requirements",
    ],
    crowdLevel: "Low",
    bestFor: ["Photography", "Solitude", "Cross-country skiing", "Snowshoeing", "Stargazing"],
    packingEssentials: ["Heavy insulated jacket and base layers", "Microspikes or snowshoes", "Warm hat, gloves, and face covering", "Hand/toe warmers", "Waterproof insulated boots", "Trekking poles"],
    avgHighRange: "30–33°F",
    avgLowRange: "9–12°F",
  },
];

export interface TrailWeatherTip {
  title: string;
  icon: string;
  severity: "danger" | "caution" | "info";
  description: string;
}

// ┌─────────────────────────────────────────────────────────┐
// │ Bryce Canyon trail weather tips — park-specific hazards │
// └─────────────────────────────────────────────────────────┘
export const TRAIL_WEATHER_TIPS: TrailWeatherTip[] = [
  {
    title: "High Elevation Effects",
    icon: "🏔️",
    severity: "caution",
    description:
      "Bryce Canyon sits at 8,000–9,100 feet elevation. The thin air means you'll tire faster, sunburn more quickly, and dehydrate sooner than at lower elevations. Allow extra time for hikes, drink more water than you think you need, and watch for symptoms of altitude sickness: headache, nausea, and shortness of breath. Trails that descend below the rim (like Navajo Loop) require climbing back up — the return is always harder than the descent.",
  },
  {
    title: "Lightning on the Rim",
    icon: "⚡",
    severity: "danger",
    description:
      "The exposed canyon rim is extremely dangerous during thunderstorms. Afternoon storms develop rapidly during monsoon season (July–September) — a clear morning can produce lightning by early afternoon. If you hear thunder or see dark clouds building, immediately leave exposed rim areas and descend below the rim or seek shelter. Never shelter under isolated trees. The Rim Trail, Bryce Point, and Inspiration Point are particularly exposed to lightning strikes.",
  },
  {
    title: "Ice and Snow on Trails",
    icon: "❄️",
    severity: "danger",
    description:
      "Trails below the rim — especially the Navajo Loop's steep switchbacks through Wall Street — become extremely treacherous when icy. Compacted snow and ice persist on shaded trail sections from November through April. Microspikes are essential, not optional. The Queens Garden connector and Peek-a-Boo Loop can have dangerous ice patches on north-facing slopes. Check trail conditions at the Visitor Center before descending below the rim in winter and early spring.",
  },
  {
    title: "Extreme Cold at Night",
    icon: "🌡️",
    severity: "caution",
    description:
      "Bryce Canyon's high elevation and dry air create dramatic temperature drops after sunset. Even in summer, nighttime temperatures can fall into the 40s°F. In winter, temperatures regularly plunge below zero (-10 to -20°F is common). If you're staying for sunset viewing or attending an astronomy program, bring significantly more warm clothing than the daytime weather suggests. Hypothermia is a real risk for unprepared visitors year-round.",
  },
  {
    title: "Monsoon Season Flash Flooding",
    icon: "⛈️",
    severity: "caution",
    description:
      "July through September brings monsoon season with sudden, intense afternoon thunderstorms. While Bryce Canyon doesn't have narrow slot canyons like some Utah parks, the steep trails below the rim can experience dangerous water runoff and rockfall during heavy rain. The Wall Street section of Navajo Loop is particularly vulnerable to falling rocks loosened by rain. Avoid hiking below the rim during active thunderstorms.",
  },
  {
    title: "Sun Exposure at Altitude",
    icon: "☀️",
    severity: "info",
    description:
      "At 8,000+ feet elevation, UV radiation is approximately 25% stronger than at sea level. Sunburn happens quickly, even on overcast days and even in winter when snow reflects UV rays. Wear SPF 50+ sunscreen, reapply every 2 hours, and use a wide-brim hat and UV-protective sunglasses. The dry air also increases dehydration — drink water consistently, even when you don't feel thirsty. Lip balm with SPF is essential in all seasons.",
  },
];

export interface BestTimeRating {
  month: string;
  weather: number; // 1-5
  crowds: number; // 1-5 (5 = fewest)
  activities: number; // 1-5
  overall: number; // 1-5
  note: string;
}

// ┌─────────────────────────────────────────────────────────┐
// │ Bryce Canyon best time ratings — adjusted for high      │
// │ elevation, heavy winter snow, and monsoon patterns      │
// └─────────────────────────────────────────────────────────┘
export const BEST_TIME_RATINGS: BestTimeRating[] = [
  { month: "Jan", weather: 1, crowds: 5, activities: 2, overall: 2, note: "Very cold. Snow photography. Limited trail access." },
  { month: "Feb", weather: 1, crowds: 5, activities: 2, overall: 2, note: "Coldest month. Great for solitude seekers." },
  { month: "Mar", weather: 2, crowds: 4, activities: 2, overall: 3, note: "Still snowy. Trails starting to thaw." },
  { month: "Apr", weather: 3, crowds: 3, activities: 3, overall: 3, note: "Variable weather. Some trails still icy." },
  { month: "May", weather: 4, crowds: 3, activities: 4, overall: 4, note: "Trails opening up. Pleasant temps." },
  { month: "Jun", weather: 5, crowds: 2, activities: 5, overall: 4, note: "Ideal weather. All trails open." },
  { month: "Jul", weather: 4, crowds: 1, activities: 4, overall: 3, note: "Warm days. Afternoon thunderstorms." },
  { month: "Aug", weather: 4, crowds: 1, activities: 4, overall: 3, note: "Monsoon storms. Still pleasant mornings." },
  { month: "Sep", weather: 5, crowds: 3, activities: 5, overall: 5, note: "Best month. Perfect weather, fewer crowds." },
  { month: "Oct", weather: 4, crowds: 3, activities: 5, overall: 5, note: "Fall colors. First snow on hoodoos." },
  { month: "Nov", weather: 2, crowds: 5, activities: 3, overall: 3, note: "Getting cold. Beautiful quiet season." },
  { month: "Dec", weather: 1, crowds: 5, activities: 2, overall: 2, note: "Snow wonderland. Very cold nights." },
];

// ── Dynamic Packing Recommendations ───────────
// (This function is generic — works for any park without modification)

export interface PackingCategory {
  category: string;
  icon: string;
  items: string[];
}

export function getPackingRecommendations(
  currentTemp: number,
  forecastHighs: number[],
  forecastLows: number[],
  precipChance: number[],
  month: number
): PackingCategory[] {
  const maxHigh = Math.max(currentTemp, ...forecastHighs.slice(0, 5));
  const minLow = Math.min(...forecastLows.slice(0, 5));
  const hasRainRisk = precipChance.slice(0, 5).some((p) => p > 30);
  const hasHighRain = precipChance.slice(0, 5).some((p) => p > 60);

  const clothing: string[] = [];
  if (maxHigh > 90) clothing.push("Lightweight, light-colored moisture-wicking shirts");
  if (maxHigh > 70) clothing.push("Shorts and breathable hiking pants");
  if (minLow < 50) clothing.push("Warm mid-layer (fleece or down jacket)");
  if (minLow < 35) clothing.push("Insulated jacket for mornings and evenings");
  if (minLow < 35) clothing.push("Warm hat and gloves");
  if (maxHigh - minLow > 30) clothing.push("Multiple layers for big temperature swings");
  clothing.push("Comfortable hiking socks (wool blend)");

  const sun: string[] = ["Sunscreen SPF 50+ (high-altitude sun is intense)"];
  if (maxHigh > 70) sun.push("Wide-brim hat for sun protection");
  sun.push("Polarized sunglasses");
  if (maxHigh > 85) sun.push("UV-protective lip balm");
  if (maxHigh > 85) sun.push("Cooling neck gaiter or bandana");

  const hydration: string[] = [];
  if (maxHigh > 90) {
    hydration.push("Minimum 1 gallon (4L) water per person per day");
    hydration.push("Electrolyte powder or tablets");
    hydration.push("Insulated water bottle to keep water cool");
  } else if (maxHigh > 75) {
    hydration.push("At least 3 liters of water per person per day");
    hydration.push("Electrolyte packets");
  } else {
    hydration.push("At least 2 liters of water per person per day");
  }
  hydration.push("Trail snacks (salty + sweet for energy)");

  const footwear: string[] = ["Sturdy hiking boots with ankle support"];
  if (month >= 12 || month <= 3) footwear.push("Microspikes for icy trail sections");
  if (month >= 12 || month <= 3) footwear.push("Waterproof insulated boots");
  if (month >= 11 || month <= 4) footwear.push("Snowshoes for deep snow areas");
  if (hasRainRisk) footwear.push("Quick-dry socks as backup");

  const safety: string[] = ["Headlamp (for early starts or if hikes run long)"];
  if (hasRainRisk) safety.push("Rain jacket (packable, waterproof)");
  if (hasHighRain) safety.push("Dry bag or waterproof phone pouch");
  if (month >= 7 && month <= 9) safety.push("Leave exposed areas if thunderstorms threaten");
  if (month >= 12 || month <= 3) safety.push("Trekking poles for stability on icy trails");
  if (maxHigh > 95) safety.push("Emergency cooling towel");
  safety.push("First aid kit with blister care");
  safety.push("Trail map or downloaded offline maps");

  return [
    { category: "Clothing", icon: "👕", items: clothing },
    { category: "Sun Protection", icon: "☀️", items: sun },
    { category: "Hydration & Nutrition", icon: "💧", items: hydration },
    { category: "Footwear", icon: "🥾", items: footwear },
    { category: "Safety & Gear", icon: "🏒", items: safety },
  ];
}

// ── Current Season Helper ─────────────────────

export function getCurrentSeason(month: number): string {
  if (month >= 3 && month <= 5) return "Spring";
  if (month >= 6 && month <= 8) return "Summer";
  if (month >= 9 && month <= 11) return "Fall";
  return "Winter";
}

export function formatTime12h(isoTime: string): string {
  const d = new Date(isoTime);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function getMonthDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Shared Weather Types ──────────────────────
// These types are shared between the server module and the client component.

export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  uvIndex: number;
  visibility: number;
  precipitation: number;
  weatherCode: number;
  isDay: boolean;
  cloudCover: number;
  pressureMb: number;
  dewPoint: number;
}

export interface HourlyForecast {
  time: string;
  temperature: number;
  feelsLike: number;
  precipitationProbability: number;
  precipitation: number;
  weatherCode: number;
  windSpeed: number;
  humidity: number;
  uvIndex: number;
  isDay: boolean;
}

export interface DailyForecast {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  weatherCode: number;
  precipitationProbabilityMax: number;
  precipitationSum: number;
  windSpeedMax: number;
  uvIndexMax: number;
  sunrise: string;
  sunset: string;
}

export interface NwsForecastPeriod {
  name: string;
  temperature: number;
  temperatureUnit: string;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
  isDaytime: boolean;
  icon: string;
}

export interface WeatherAlert {
  id: string;
  severity: "extreme" | "severe" | "moderate" | "minor" | "unknown";
  event: string;
  headline: string;
  description: string;
  source: "nws" | "nps";
  url?: string;
}

export interface WeatherData {
  current: CurrentWeather | null;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
  nwsForecast: NwsForecastPeriod[];
  alerts: WeatherAlert[];
  fetchedAt: number;
}

// ── Temperature Gradient ──────────────────────

export function getTemperatureGradient(temp: number): string {
  if (temp >= 95) return "from-orange-700 via-red-600 to-red-800";
  if (temp >= 80) return "from-orange-600 via-amber-500 to-orange-700";
  if (temp >= 65) return "from-amber-500 via-yellow-500 to-orange-500";
  if (temp >= 50) return "from-sky-600 via-blue-500 to-indigo-600";
  if (temp >= 35) return "from-blue-700 via-indigo-600 to-blue-800";
  return "from-indigo-800 via-blue-900 to-slate-800";
}

// ── WMO Weather Code Helpers ──────────────────

const WMO_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export function getWeatherCodeLabel(code: number): string {
  return WMO_LABELS[code] || "Unknown";
}

const WMO_ICONS_DAY: Record<number, string> = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  53: "🌦️",
  55: "🌦️",
  56: "🌨️",
  57: "🌨️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  66: "🌨️",
  67: "🌨️",
  71: "🌨️",
  73: "🌨️",
  75: "🌨️",
  77: "🌨️",
  80: "🌦️",
  81: "🌧️",
  82: "🌧️",
  85: "🌨️",
  86: "🌨️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

const WMO_ICONS_NIGHT: Record<number, string> = {
  ...WMO_ICONS_DAY,
  0: "🌙",
  1: "🌙",
  2: "☁️",
};

export function getWeatherIcon(code: number, isDay: boolean): string {
  const icons = isDay ? WMO_ICONS_DAY : WMO_ICONS_NIGHT;
  return icons[code] || "🌡️";
}

export function getUvLabel(index: number): { label: string; color: string } {
  if (index <= 2) return { label: "Low", color: "bg-green-500" };
  if (index <= 5) return { label: "Moderate", color: "bg-yellow-500" };
  if (index <= 7) return { label: "High", color: "bg-orange-500" };
  if (index <= 10) return { label: "Very High", color: "bg-red-600" };
  return { label: "Extreme", color: "bg-purple-600" };
}

export function getWindDirectionLabel(degrees: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(degrees / 22.5) % 16;
  return dirs[idx];
}
