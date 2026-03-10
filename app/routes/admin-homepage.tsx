import { Link, useLoaderData, Form, redirect, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/admin-homepage";
import { useState } from "react";
import { requireAuth } from "../lib/auth.server";
import { getSystemPage, upsertSystemPage } from "../lib/pages.server";
import ImageUploader from "../components/ImageUploader";
import FocalPointPicker from "../components/FocalPointPicker";
import SerpPreview from "../components/SerpPreview";
import SeoScorecard from "../components/SeoScorecard";
import { applyTitleTemplate } from "../lib/title-template";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Pages | Admin | ${siteConfig.siteName}` }];
}

const DEFAULT_HOME = {
  hero: {
    subtitle: siteConfig.defaults.heroSubtitle,
    title_line1: siteConfig.defaults.heroLine1,
    title_line2: siteConfig.defaults.heroLine2,
    title_accent: siteConfig.defaults.heroAccent,
    description: siteConfig.defaults.heroDescription,
    search_placeholder: siteConfig.defaults.searchPlaceholder,
    bg_image: "",
    bg_image_focal_x: 50,
    bg_image_focal_y: 50,
    gradient_from: "#2c2418",
    gradient_via: "#92400e",
    gradient_to: "#c1440e",
    gradient_opacity: 100,
    gradient_direction: "to-br",
    accent_line: "line3",
    title_size_mobile: 36,
    title_size_desktop: 72,
    title_color: "#ffffff",
    accent_color: "#d4a574",
  },
  explore: {
    title: siteConfig.defaults.exploreTitle,
    subtitle: siteConfig.defaults.exploreSubtitle,
  },
  featured: {
    title: "Featured Listings",
    subtitle: siteConfig.defaults.featuredSubtitle,
  },
  plan_your_visit: {
    title: "Plan Your Visit",
    subtitle: siteConfig.defaults.planVisitSubtitle,
    cards: [
      {
        icon: "sun",
        title: "Weather & Seasons",
        body: siteConfig.defaults.weatherCard,
      },
      {
        icon: "map",
        title: "Getting There",
        body: siteConfig.defaults.gettingThereCard,
      },
      {
        icon: "calendar",
        title: "Best Time to Visit",
        body: siteConfig.defaults.bestTimeCard,
      },
    ],
  },
  newsletter: {
    title: "Stay in the Loop",
    subtitle: siteConfig.defaults.newsletterSubtitle,
    disclaimer: "We respect your privacy. Unsubscribe at any time.",
  },
};

const DEFAULT_HOME_SEO = {
  meta_title: siteConfig.defaults.homeSeoTitle,
  meta_description: siteConfig.defaults.homeSeoDescription,
  focus_keyphrase: "",
  og_image: "",
};

function mergeHomeContent(pageContent: any) {
  if (!pageContent) return DEFAULT_HOME;

  const incomingCards = Array.isArray(pageContent?.plan_your_visit?.cards)
    ? pageContent.plan_your_visit.cards
    : [];
  const cards = DEFAULT_HOME.plan_your_visit.cards.map((defaultCard, index) => ({
    ...defaultCard,
    ...(incomingCards[index] || {}),
  }));

  return {
    ...DEFAULT_HOME,
    ...pageContent,
    hero: {
      ...DEFAULT_HOME.hero,
      ...(pageContent.hero || {}),
    },
    explore: {
      ...DEFAULT_HOME.explore,
      ...(pageContent.explore || {}),
    },
    featured: {
      ...DEFAULT_HOME.featured,
      ...(pageContent.featured || {}),
    },
    plan_your_visit: {
      ...DEFAULT_HOME.plan_your_visit,
      ...(pageContent.plan_your_visit || {}),
      cards,
    },
    newsletter: {
      ...DEFAULT_HOME.newsletter,
      ...(pageContent.newsletter || {}),
    },
  };
}

function normalizeFocal(value: unknown, fallback = 50) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function getObjectPosition(x: unknown, y: unknown) {
  return `${normalizeFocal(x)}% ${normalizeFocal(y)}%`;
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const page = await getSystemPage("home");
  return {
    content: mergeHomeContent(page?.content),
    seo: {
      meta_title: page?.meta_title || DEFAULT_HOME_SEO.meta_title,
      meta_description: page?.meta_description || DEFAULT_HOME_SEO.meta_description,
      focus_keyphrase: page?.focus_keyphrase || DEFAULT_HOME_SEO.focus_keyphrase,
      og_image: page?.og_image || DEFAULT_HOME_SEO.og_image,
      slug: "",
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const raw = formData.get("content") as string;
  const content = JSON.parse(raw);
  const metaTitle = String(formData.get("meta_title") || "").trim();
  const metaDescription = String(formData.get("meta_description") || "").trim();
  const focusKeyphrase = String(formData.get("focus_keyphrase") || "").trim();
  const ogImage = String(formData.get("og_image") || "").trim();

  await upsertSystemPage({
    slug: "home",
    title: "Homepage",
    content,
    meta_title: metaTitle || null,
    meta_description: metaDescription || null,
    focus_keyphrase: focusKeyphrase || null,
    og_image: ogImage || null,
    status: "published",
  });
  return redirect("/admin/pages/homepage?toast=Homepage+saved");
}

export default function AdminPages() {
  const { content, seo } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as
    | { settings: Record<string, string> }
    | undefined;
  const [data, setData] = useState(content as typeof DEFAULT_HOME);
  const [metaTitle, setMetaTitle] = useState(seo.meta_title);
  const [metaDescription, setMetaDescription] = useState(seo.meta_description);
  const [focusKeyphrase, setFocusKeyphrase] = useState(seo.focus_keyphrase);
  const [ogImage, setOgImage] = useState(seo.og_image);
  const [seoAiLoading, setSeoAiLoading] = useState<"title" | "description" | null>(null);
  const [keyphraseAiLoading, setKeyphraseAiLoading] = useState(false);
  const [openSection, setOpenSection] = useState<string>("hero");

  const update = (path: string, value: any) => {
    setData((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const toggle = (section: string) =>
    setOpenSection(openSection === section ? "" : section);

  const handleSeoAiGenerate = async (field: "title" | "description") => {
    setSeoAiLoading(field);
    try {
      const homepageHeading = [
        data.hero.title_line1,
        data.hero.title_line2,
        data.hero.title_accent,
      ]
        .filter(Boolean)
        .join(" ");

      const res = await fetch("/api/ai-seo-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          name: homepageHeading || `${siteConfig.siteName} Homepage`,
          pageType: "page",
          slug: "",
          description: data.hero.description || "",
          focusKeyphrase: focusKeyphrase || undefined,
          currentMetaTitle: metaTitle || undefined,
          currentMetaDescription: metaDescription || undefined,
        }),
      });
      const result = await res.json();
      if (result.metaTitle && field === "title") setMetaTitle(result.metaTitle);
      if (result.metaDescription && field === "description") {
        setMetaDescription(result.metaDescription);
      }
    } catch {
      // Silent fail in admin controls
    } finally {
      setSeoAiLoading(null);
    }
  };

  const handleAiKeyphrase = async () => {
    const homepageHeading = [
      data.hero.title_line1,
      data.hero.title_line2,
      data.hero.title_accent,
    ]
      .filter(Boolean)
      .join(" ");
    if (!homepageHeading && !data.hero.description) return;

    setKeyphraseAiLoading(true);
    try {
      const bodyHtml = `<h1>${homepageHeading}</h1><p>${data.hero.description || ""}</p>`;
      const res = await fetch("/api/ai-keyphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bodyHtml,
          contentType: "page",
          title: homepageHeading || "Homepage",
          slug: "",
        }),
      });
      const result = await res.json();
      if (result.keyphrase) setFocusKeyphrase(result.keyphrase);
    } catch {
      // Silent fail in admin controls
    } finally {
      setKeyphraseAiLoading(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary";
  const titleTemplate =
    rootData?.settings?.title_template || siteConfig.defaults.titleTemplate;
  const renderedTitle = applyTitleTemplate(
    metaTitle || siteConfig.defaults.homeSeoTitle,
    titleTemplate
  );
  const homeHeading = [
    data.hero.title_line1,
    data.hero.title_line2,
    data.hero.title_accent,
  ]
    .filter(Boolean)
    .join(" ");
  const seoBodyHtml = `
    <h1>${homeHeading}</h1>
    <p>${data.hero.description || ""}</p>
    <h2>${data.explore.title || ""}</h2><p>${data.explore.subtitle || ""}</p>
    <h2>${data.featured.title || ""}</h2><p>${data.featured.subtitle || ""}</p>
    <h2>${data.plan_your_visit.title || ""}</h2><p>${data.plan_your_visit.subtitle || ""}</p>
    <h2>${data.newsletter.title || ""}</h2><p>${data.newsletter.subtitle || ""}</p>
  `;

  return (
    <div className="px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">
          Admin
        </Link>
        <span>/</span>
        <Link to="/admin/pages" className="hover:text-primary">
          Pages
        </Link>
        <span>/</span>
        <span>Homepage</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-dark">
          Homepage Content
        </h1>
        <a
          href="/"
          target="_blank"
          rel="noopener"
          className="text-sm text-primary hover:underline"
        >
          Preview Homepage →
        </a>
      </div>

      <Form method="post" className="max-w-3xl space-y-4">
        <input
          type="hidden"
          name="content"
          value={JSON.stringify(data)}
        />
        <input type="hidden" name="meta_title" value={metaTitle} />
        <input type="hidden" name="meta_description" value={metaDescription} />
        <input type="hidden" name="focus_keyphrase" value={focusKeyphrase} />
        <input type="hidden" name="og_image" value={ogImage} />

        {/* HERO SECTION */}
        <Section
          title="Hero Section"
          isOpen={openSection === "hero"}
          onToggle={() => toggle("hero")}
        >
          <div className="space-y-4">
            <Field label="Subtitle" value={data.hero.subtitle} onChange={(v) => update("hero.subtitle", v)} inputClass={inputClass} />
            {/* Title Lines with Accent Selection */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Title Lines <span className="font-normal text-gray-400">— select which line is the accent</span>
              </label>
              <div className="space-y-2 mt-1">
                {([
                  { key: "line1", field: "title_line1" as const },
                  { key: "line2", field: "title_line2" as const },
                  { key: "line3", field: "title_accent" as const },
                ]).map(({ key, field }) => {
                  const isAccent = ((data.hero as any).accent_line || "line3") === key;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <label className="flex items-center gap-1 cursor-pointer shrink-0" title="Set as accent line">
                        <input
                          type="radio"
                          name="accent_line_radio"
                          checked={isAccent}
                          onChange={() => update("hero.accent_line", key)}
                          className="accent-primary w-4 h-4"
                        />
                        <span className={`text-[11px] w-5 text-center ${isAccent ? "text-primary" : "text-transparent"}`}>
                          ★
                        </span>
                      </label>
                      <input
                        type="text"
                        value={(data.hero as any)[field]}
                        onChange={(e) => update(`hero.${field}`, e.target.value)}
                        className={`${inputClass} ${isAccent ? "ring-1 ring-primary/30 border-primary/40" : ""}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Title Font Size */}
            <div className="border-t border-gray-200 pt-4 mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Title Font Size</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Mobile</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={20}
                      max={60}
                      value={(data.hero as any).title_size_mobile || 36}
                      onChange={(e) => update("hero.title_size_mobile", Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <div className="flex items-center">
                      <input
                        type="number"
                        min={20}
                        max={60}
                        value={(data.hero as any).title_size_mobile || 36}
                        onChange={(e) => {
                          const v = Math.min(60, Math.max(20, Number(e.target.value) || 20));
                          update("hero.title_size_mobile", v);
                        }}
                        className="w-14 px-1.5 py-1 border border-gray-300 rounded-lg text-xs text-center font-mono focus:outline-none focus:border-primary"
                      />
                      <span className="text-[10px] text-gray-400 ml-1">px</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Desktop</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={36}
                      max={120}
                      value={(data.hero as any).title_size_desktop || 72}
                      onChange={(e) => update("hero.title_size_desktop", Number(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <div className="flex items-center">
                      <input
                        type="number"
                        min={36}
                        max={120}
                        value={(data.hero as any).title_size_desktop || 72}
                        onChange={(e) => {
                          const v = Math.min(120, Math.max(36, Number(e.target.value) || 36));
                          update("hero.title_size_desktop", v);
                        }}
                        className="w-14 px-1.5 py-1 border border-gray-300 rounded-lg text-xs text-center font-mono focus:outline-none focus:border-primary"
                      />
                      <span className="text-[10px] text-gray-400 ml-1">px</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Title Colors */}
            <div className="border-t border-gray-200 pt-4 mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Title Colors</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Title Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(data.hero as any).title_color || "#ffffff"}
                      onChange={(e) => update("hero.title_color", e.target.value)}
                      className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={(data.hero as any).title_color || "#ffffff"}
                      onChange={(e) => update("hero.title_color", e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={(data.hero as any).accent_color || "#d4a574"}
                      onChange={(e) => update("hero.accent_color", e.target.value)}
                      className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={(data.hero as any).accent_color || "#d4a574"}
                      onChange={(e) => update("hero.accent_color", e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <textarea rows={3} value={data.hero.description} onChange={(e) => update("hero.description", e.target.value)} className={inputClass} />
            </div>
            <Field label="Search Placeholder" value={data.hero.search_placeholder} onChange={(v) => update("hero.search_placeholder", v)} inputClass={inputClass} />

            {/* ── Hero Background ── */}
            <div className="border-t border-gray-200 pt-4 mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Hero Background</p>

              {/* Background Image */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start mb-4">
                <ImageUploader
                  label="Background Image"
                  hint="Upload a photo or choose from the media library. The gradient will overlay on top."
                  value={(data.hero as any).bg_image || null}
                  onChange={(url) => update("hero.bg_image", url || "")}
                />
                <FocalPointPicker
                  label="Background Focus Point"
                  hint="Sets which part stays centered when the hero image crops on different screens."
                  imageUrl={(data.hero as any).bg_image || null}
                  x={Number((data.hero as any).bg_image_focal_x ?? 50)}
                  y={Number((data.hero as any).bg_image_focal_y ?? 50)}
                  onChange={(x, y) => {
                    update("hero.bg_image_focal_x", x);
                    update("hero.bg_image_focal_y", y);
                  }}
                />
              </div>

              {/* Gradient Colors */}
              <div className="mb-4">
                <p className="block text-xs font-medium text-gray-500 mb-2">Gradient Colors</p>
                <div className="grid grid-cols-3 gap-3">
                  {/* From */}
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">From</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(data.hero as any).gradient_from || "#2c2418"}
                        onChange={(e) => update("hero.gradient_from", e.target.value)}
                        className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={(data.hero as any).gradient_from || "#2c2418"}
                        onChange={(e) => update("hero.gradient_from", e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  {/* Via */}
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">Via</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(data.hero as any).gradient_via || "#92400e"}
                        onChange={(e) => update("hero.gradient_via", e.target.value)}
                        className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={(data.hero as any).gradient_via || "#92400e"}
                        onChange={(e) => update("hero.gradient_via", e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                  {/* To */}
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">To</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(data.hero as any).gradient_to || "#c1440e"}
                        onChange={(e) => update("hero.gradient_to", e.target.value)}
                        className="w-9 h-9 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={(data.hero as any).gradient_to || "#c1440e"}
                        onChange={(e) => update("hero.gradient_to", e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Gradient Direction */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Gradient Direction</label>
                <select
                  value={(data.hero as any).gradient_direction || "to-br"}
                  onChange={(e) => update("hero.gradient_direction", e.target.value)}
                  className={inputClass}
                >
                  <option value="to-br">Diagonal (↘)</option>
                  <option value="to-b">Top to Bottom (↓)</option>
                  <option value="to-r">Left to Right (→)</option>
                  <option value="to-t">Bottom to Top (↑)</option>
                  <option value="to-bl">Diagonal (↙)</option>
                  <option value="radial">Radial (center)</option>
                </select>
              </div>

              {/* Overlay Opacity */}
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">Gradient Opacity</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={(data.hero as any).gradient_opacity ?? 100}
                    onChange={(e) => update("hero.gradient_opacity", Number(e.target.value))}
                    className="flex-1 accent-primary"
                  />
                  <div className="flex items-center">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={(data.hero as any).gradient_opacity ?? 100}
                      onChange={(e) => {
                        const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                        update("hero.gradient_opacity", v);
                      }}
                      className="w-14 px-1.5 py-1 border border-gray-300 rounded-lg text-xs text-center font-mono focus:outline-none focus:border-primary"
                    />
                    <span className="text-[10px] text-gray-400 ml-1">%</span>
                  </div>
                </div>
              </div>

              {/* Live Preview */}
              <div>
                <p className="block text-xs font-medium text-gray-500 mb-1">Preview</p>
                <HeroPreview hero={data.hero as any} />
              </div>
            </div>
          </div>
        </Section>

        {/* EXPLORE SECTION */}
        <Section
          title="Explore Section"
          isOpen={openSection === "explore"}
          onToggle={() => toggle("explore")}
        >
          <div className="space-y-4">
            <Field label="Title" value={data.explore.title} onChange={(v) => update("explore.title", v)} inputClass={inputClass} />
            <Field label="Subtitle" value={data.explore.subtitle} onChange={(v) => update("explore.subtitle", v)} inputClass={inputClass} />
          </div>
        </Section>

        {/* FEATURED SECTION */}
        <Section
          title="Featured Listings Section"
          isOpen={openSection === "featured"}
          onToggle={() => toggle("featured")}
        >
          <div className="space-y-4">
            <Field label="Title" value={data.featured.title} onChange={(v) => update("featured.title", v)} inputClass={inputClass} />
            <Field label="Subtitle" value={data.featured.subtitle} onChange={(v) => update("featured.subtitle", v)} inputClass={inputClass} />
          </div>
        </Section>

        {/* PLAN YOUR VISIT */}
        <Section
          title="Plan Your Visit Section"
          isOpen={openSection === "plan_your_visit"}
          onToggle={() => toggle("plan_your_visit")}
        >
          <div className="space-y-4">
            <Field label="Section Title" value={data.plan_your_visit.title} onChange={(v) => update("plan_your_visit.title", v)} inputClass={inputClass} />
            <Field label="Section Subtitle" value={data.plan_your_visit.subtitle} onChange={(v) => update("plan_your_visit.subtitle", v)} inputClass={inputClass} />
            {data.plan_your_visit.cards.map((card: any, i: number) => (
              <div key={i} className="bg-gray-50 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase">Card {i + 1}</p>
                <Field label="Title" value={card.title} onChange={(v) => update(`plan_your_visit.cards.${i}.title`, v)} inputClass={inputClass} />
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
                  <textarea rows={4} value={card.body} onChange={(e) => update(`plan_your_visit.cards.${i}.body`, e.target.value)} className={inputClass} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* NEWSLETTER */}
        <Section
          title="Newsletter Section"
          isOpen={openSection === "newsletter"}
          onToggle={() => toggle("newsletter")}
        >
          <div className="space-y-4">
            <Field label="Title" value={data.newsletter.title} onChange={(v) => update("newsletter.title", v)} inputClass={inputClass} />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Subtitle</label>
              <textarea rows={3} value={data.newsletter.subtitle} onChange={(e) => update("newsletter.subtitle", e.target.value)} className={inputClass} />
            </div>
            <Field label="Disclaimer" value={data.newsletter.disclaimer} onChange={(v) => update("newsletter.disclaimer", v)} inputClass={inputClass} />
          </div>
        </Section>

        <Section
          title="SEO Settings"
          isOpen={openSection === "seo"}
          onToggle={() => toggle("seo")}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                URL Slug
              </label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-400">/</span>
                <input
                  type="text"
                  value="(homepage)"
                  disabled
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50 text-gray-500"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Homepage URL is fixed to `/`.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">
                  Focus Keyphrase
                </label>
                <button
                  type="button"
                  onClick={handleAiKeyphrase}
                  disabled={keyphraseAiLoading}
                  className="text-[10px] text-violet-600 hover:text-violet-800 disabled:opacity-50"
                >
                  {keyphraseAiLoading ? "Generating…" : "AI Suggest"}
                </button>
              </div>
              <input
                type="text"
                value={focusKeyphrase}
                onChange={(e) => setFocusKeyphrase(e.target.value)}
                className={inputClass}
                placeholder="e.g. zion national park travel guide"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">
                  Meta Title
                </label>
                <button
                  type="button"
                  onClick={() => handleSeoAiGenerate("title")}
                  disabled={seoAiLoading !== null}
                  className="text-[10px] text-violet-600 hover:text-violet-800 disabled:opacity-50"
                >
                  {seoAiLoading === "title" ? "Generating…" : "AI Generate"}
                </button>
              </div>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                className={inputClass}
                placeholder="SEO title for homepage"
              />
              <p className="text-xs text-gray-400 mt-1">{metaTitle.length}/60</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">
                  Meta Description
                </label>
                <button
                  type="button"
                  onClick={() => handleSeoAiGenerate("description")}
                  disabled={seoAiLoading !== null}
                  className="text-[10px] text-violet-600 hover:text-violet-800 disabled:opacity-50"
                >
                  {seoAiLoading === "description" ? "Generating…" : "AI Generate"}
                </button>
              </div>
              <textarea
                rows={3}
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                className={inputClass}
                placeholder="SEO description for homepage"
              />
              <p className="text-xs text-gray-400 mt-1">
                {metaDescription.length}/160
              </p>
            </div>

            <ImageUploader
              label="OG Image"
              value={ogImage || null}
              onChange={(url) => setOgImage(url || "")}
              hint="Used for social preview cards (Open Graph / Twitter)."
            />

            <SerpPreview
              title={renderedTitle}
              url={`${siteConfig.siteUrl}/`}
              description={metaDescription}
              image={ogImage || (data.hero as any).bg_image || null}
            />

            <SeoScorecard
              contentType="page"
              focusKeyphrase={focusKeyphrase}
              metaTitle={metaTitle}
              metaDescription={metaDescription}
              slug=""
              bodyHtml={seoBodyHtml}
              featuredImage={ogImage || (data.hero as any).bg_image || ""}
            />
          </div>
        </Section>

        <div className="pt-4">
          <button
            type="submit"
            className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Save All Changes
          </button>
        </div>
      </Form>
    </div>
  );
}

function Section({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
      >
        <h2 className="text-sm font-semibold text-dark">{title}</h2>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="px-5 pb-5 border-t border-gray-100 pt-4">{children}</div>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputClass,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputClass: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </div>
  );
}

function HeroPreview({
  hero,
}: {
  hero: {
    bg_image?: string;
    bg_image_focal_x?: number;
    bg_image_focal_y?: number;
    gradient_from?: string;
    gradient_via?: string;
    gradient_to?: string;
    gradient_opacity?: number;
    gradient_direction?: string;
  };
}) {
  const from = hero.gradient_from || "#2c2418";
  const via = hero.gradient_via || "#92400e";
  const to = hero.gradient_to || "#c1440e";
  const opacity = typeof hero.gradient_opacity === "number" ? hero.gradient_opacity : 100;
  const dir = hero.gradient_direction || "to-br";

  const directionCSS: Record<string, string> = {
    "to-br": "to bottom right",
    "to-b": "to bottom",
    "to-r": "to right",
    "to-t": "to top",
    "to-bl": "to bottom left",
  };

  const gradientBg =
    dir === "radial"
      ? `radial-gradient(circle, ${from}, ${via}, ${to})`
      : `linear-gradient(${directionCSS[dir] || "to bottom right"}, ${from}, ${via}, ${to})`;

  return (
    <div className="relative h-20 rounded-lg overflow-hidden border border-gray-200">
      {hero.bg_image && (
        <img
          src={hero.bg_image}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition: getObjectPosition(
              hero.bg_image_focal_x,
              hero.bg_image_focal_y
            ),
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: gradientBg, opacity: opacity / 100 }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white text-xs font-medium drop-shadow-md">
          Hero Background Preview
        </span>
      </div>
    </div>
  );
}
