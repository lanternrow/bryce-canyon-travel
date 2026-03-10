import { getAllDirectories, getDirectoryConfig } from "./directory-config";
import { siteConfig } from "./site-config";

export type DirectoryHeroContent = {
  title: string;
  subtitle: string;
  search_placeholder: string;
  bg_image: string;
  bg_image_focal_x: number;
  bg_image_focal_y: number;
  gradient_from: string;
  gradient_via: string;
  gradient_to: string;
  gradient_opacity: number;
  gradient_direction: string;
  height: number;
  title_size_mobile: number;
  title_size_desktop: number;
  title_color: string;
  subtitle_color: string;
};

export type DirectoryPageContent = {
  hero: DirectoryHeroContent;
};

export type DirectoryPageDefinition = {
  slug: string;
  title: string;
  subtitle: string;
  path: string;
};

const DEFAULT_HERO_STYLE: Omit<
  DirectoryHeroContent,
  "title" | "subtitle" | "search_placeholder" | "bg_image"
> = {
  bg_image_focal_x: 50,
  bg_image_focal_y: 50,
  gradient_from: "#111827",
  gradient_via: "#1f2937",
  gradient_to: "#92400e",
  gradient_opacity: 85,
  gradient_direction: "to-br",
  height: 300,
  title_size_mobile: 48,
  title_size_desktop: 64,
  title_color: "#ffffff",
  subtitle_color: "#f3f4f6",
};

function normalizeDirectorySearchPlaceholder(title: string) {
  if (title.toLowerCase() === "all listings") return "Search all listings...";
  return `Search ${title.toLowerCase()}...`;
}

export function getDirectoryPageDefinitions(): DirectoryPageDefinition[] {
  return getAllDirectories().map((directory) => ({
    slug: directory.slug,
    title: directory.title,
    subtitle: directory.subtitle,
    path: `/${directory.slug}`,
  }));
}

export function getDefaultDirectoryPageContent(
  slug: string
): DirectoryPageContent {
  const directory = getDirectoryConfig(slug);
  if (!directory) {
    return {
      hero: {
        title: "Directory",
        subtitle: `Browse listings near ${siteConfig.parkName}.`,
        search_placeholder: "Search listings...",
        bg_image: "",
        ...DEFAULT_HERO_STYLE,
      },
    };
  }

  return {
    hero: {
      title: directory.title,
      subtitle: directory.subtitle,
      search_placeholder: normalizeDirectorySearchPlaceholder(directory.title),
      bg_image: directory.heroImage || "",
      ...DEFAULT_HERO_STYLE,
    },
  };
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
}

export function mergeDirectoryPageContent(
  slug: string,
  pageContent: unknown
): DirectoryPageContent {
  const defaults = getDefaultDirectoryPageContent(slug);
  if (!pageContent || typeof pageContent !== "object") return defaults;

  const incoming = pageContent as Record<string, unknown>;
  const incomingHero =
    incoming.hero && typeof incoming.hero === "object"
      ? (incoming.hero as Record<string, unknown>)
      : {};

  const mergedHero: DirectoryHeroContent = {
    ...defaults.hero,
    title:
      typeof incomingHero.title === "string" && incomingHero.title.trim()
        ? incomingHero.title.trim()
        : defaults.hero.title,
    subtitle:
      typeof incomingHero.subtitle === "string"
        ? incomingHero.subtitle
        : defaults.hero.subtitle,
    search_placeholder:
      typeof incomingHero.search_placeholder === "string" &&
      incomingHero.search_placeholder.trim()
        ? incomingHero.search_placeholder.trim()
        : defaults.hero.search_placeholder,
    bg_image:
      typeof incomingHero.bg_image === "string"
        ? incomingHero.bg_image
        : defaults.hero.bg_image,
    bg_image_focal_x: normalizeNumber(
      incomingHero.bg_image_focal_x,
      defaults.hero.bg_image_focal_x,
      0,
      100
    ),
    bg_image_focal_y: normalizeNumber(
      incomingHero.bg_image_focal_y,
      defaults.hero.bg_image_focal_y,
      0,
      100
    ),
    gradient_from:
      typeof incomingHero.gradient_from === "string" &&
      incomingHero.gradient_from
        ? incomingHero.gradient_from
        : defaults.hero.gradient_from,
    gradient_via:
      typeof incomingHero.gradient_via === "string" && incomingHero.gradient_via
        ? incomingHero.gradient_via
        : defaults.hero.gradient_via,
    gradient_to:
      typeof incomingHero.gradient_to === "string" && incomingHero.gradient_to
        ? incomingHero.gradient_to
        : defaults.hero.gradient_to,
    gradient_opacity: normalizeNumber(
      incomingHero.gradient_opacity,
      defaults.hero.gradient_opacity,
      0,
      100
    ),
    gradient_direction:
      typeof incomingHero.gradient_direction === "string" &&
      incomingHero.gradient_direction
        ? incomingHero.gradient_direction
        : defaults.hero.gradient_direction,
    height: normalizeNumber(incomingHero.height, defaults.hero.height, 220, 520),
    title_size_mobile: normalizeNumber(
      incomingHero.title_size_mobile,
      defaults.hero.title_size_mobile,
      24,
      72
    ),
    title_size_desktop: normalizeNumber(
      incomingHero.title_size_desktop,
      defaults.hero.title_size_desktop,
      32,
      96
    ),
    title_color:
      typeof incomingHero.title_color === "string" && incomingHero.title_color
        ? incomingHero.title_color
        : defaults.hero.title_color,
    subtitle_color:
      typeof incomingHero.subtitle_color === "string" &&
      incomingHero.subtitle_color
        ? incomingHero.subtitle_color
        : defaults.hero.subtitle_color,
  };

  return { hero: mergedHero };
}
