import { Form, Link, redirect, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/admin-contact-page";
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
  return [{ title: `Contact Page | Admin | ${siteConfig.siteName}` }];
}

const DEFAULT_CONTACT_PAGE = {
  hero: {
    title: "CONTACT US",
    subtitle:
      siteConfig.defaults.contactSubtitle,
    bg_image: "",
    bg_image_focal_x: 50,
    bg_image_focal_y: 50,
    gradient_from: "#111827",
    gradient_via: "#1f2937",
    gradient_to: "#111827",
    gradient_opacity: 100,
    gradient_direction: "to-br",
    height: 300,
    title_size_mobile: 48,
    title_size_desktop: 64,
    title_color: "#ffffff",
    subtitle_color: "#d1d5db",
  },
};

const DEFAULT_CONTACT_SEO = {
  meta_title: siteConfig.defaults.contactSeoTitle,
  meta_description: siteConfig.defaults.contactSeoDescription,
  focus_keyphrase: "",
  og_image: "",
};

function mergeContactContent(pageContent: any) {
  if (!pageContent) return DEFAULT_CONTACT_PAGE;
  return {
    ...DEFAULT_CONTACT_PAGE,
    ...pageContent,
    hero: {
      ...DEFAULT_CONTACT_PAGE.hero,
      ...(pageContent.hero || {}),
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
  const page = await getSystemPage("contact");
  return {
    content: mergeContactContent(page?.content),
    seo: {
      meta_title: page?.meta_title || DEFAULT_CONTACT_SEO.meta_title,
      meta_description: page?.meta_description || DEFAULT_CONTACT_SEO.meta_description,
      focus_keyphrase: page?.focus_keyphrase || DEFAULT_CONTACT_SEO.focus_keyphrase,
      og_image: page?.og_image || DEFAULT_CONTACT_SEO.og_image,
      slug: "contact",
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const raw = (formData.get("content") as string) || "{}";

  let content: Record<string, any> = DEFAULT_CONTACT_PAGE;
  try {
    content = JSON.parse(raw);
  } catch {
    content = DEFAULT_CONTACT_PAGE;
  }

  const metaTitle = String(formData.get("meta_title") || "").trim();
  const metaDescription = String(formData.get("meta_description") || "").trim();
  const focusKeyphrase = String(formData.get("focus_keyphrase") || "").trim();
  const ogImage = String(formData.get("og_image") || "").trim();

  await upsertSystemPage({
    slug: "contact",
    title: "Contact Page",
    content,
    meta_title: metaTitle || null,
    meta_description: metaDescription || null,
    focus_keyphrase: focusKeyphrase || null,
    og_image: ogImage || null,
    status: "published",
  });

  return redirect("/admin/pages/contact?toast=Contact+page+saved");
}

export default function AdminContactPage() {
  const { content, seo } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as
    | { settings: Record<string, string> }
    | undefined;
  const [data, setData] = useState(content as typeof DEFAULT_CONTACT_PAGE);
  const [metaTitle, setMetaTitle] = useState(seo.meta_title);
  const [metaDescription, setMetaDescription] = useState(seo.meta_description);
  const [focusKeyphrase, setFocusKeyphrase] = useState(seo.focus_keyphrase);
  const [ogImage, setOgImage] = useState(seo.og_image);
  const [seoAiLoading, setSeoAiLoading] = useState<"title" | "description" | null>(null);
  const [keyphraseAiLoading, setKeyphraseAiLoading] = useState(false);
  const [openSection, setOpenSection] = useState("hero");

  const update = (path: string, value: any) => {
    setData((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleSeoAiGenerate = async (field: "title" | "description") => {
    setSeoAiLoading(field);
    try {
      const res = await fetch("/api/ai-seo-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field,
          name: hero.title || "Contact Us",
          pageType: "page",
          slug: seo.slug,
          description: hero.subtitle || "",
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
    if (!hero.title && !hero.subtitle) return;
    setKeyphraseAiLoading(true);
    try {
      const bodyHtml = `<h1>${hero.title || ""}</h1><p>${hero.subtitle || ""}</p>`;
      const res = await fetch("/api/ai-keyphrase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bodyHtml,
          contentType: "page",
          title: hero.title || "Contact Us",
          slug: seo.slug,
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
  const hero = data.hero;
  const titleTemplate =
    rootData?.settings?.title_template || siteConfig.defaults.titleTemplate;
  const renderedTitle = applyTitleTemplate(
    metaTitle || hero.title || "Contact Us",
    titleTemplate
  );
  const seoBodyHtml = `<h1>${hero.title || ""}</h1><p>${hero.subtitle || ""}</p>`;

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
        <span>Contact Page</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-dark">Contact Page Content</h1>
        <a
          href="/contact"
          target="_blank"
          rel="noopener"
          className="text-sm text-primary hover:underline"
        >
          Preview Contact Page →
        </a>
      </div>

      <Form method="post" className="max-w-3xl space-y-4">
        <input type="hidden" name="content" value={JSON.stringify(data)} />
        <input type="hidden" name="meta_title" value={metaTitle} />
        <input type="hidden" name="meta_description" value={metaDescription} />
        <input type="hidden" name="focus_keyphrase" value={focusKeyphrase} />
        <input type="hidden" name="og_image" value={ogImage} />

        <Section
          title="Hero Text"
          isOpen={openSection === "hero"}
          onToggle={() => setOpenSection(openSection === "hero" ? "" : "hero")}
        >
          <div className="space-y-4">
            <Field
              label="Hero Title"
              value={hero.title}
              onChange={(value) => update("hero.title", value)}
              inputClass={inputClass}
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Hero Subtitle
              </label>
              <textarea
                rows={3}
                value={hero.subtitle}
                onChange={(event) => update("hero.subtitle", event.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Hero Height
                </label>
                <input
                  type="number"
                  min={220}
                  max={520}
                  value={hero.height}
                  onChange={(event) =>
                    update("hero.height", Math.min(520, Math.max(220, Number(event.target.value) || 300)))
                  }
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Title Color
                  </label>
                  <input
                    type="color"
                    value={hero.title_color}
                    onChange={(event) => update("hero.title_color", event.target.value)}
                    className="h-10 w-full p-1 border border-gray-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Subtitle Color
                  </label>
                  <input
                    type="color"
                    value={hero.subtitle_color}
                    onChange={(event) => update("hero.subtitle_color", event.target.value)}
                    className="h-10 w-full p-1 border border-gray-300 rounded-lg bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Hero Background"
          isOpen={openSection === "background"}
          onToggle={() =>
            setOpenSection(openSection === "background" ? "" : "background")
          }
        >
          <div className="space-y-4">
            <ImageUploader
              label="Hero Background Image"
              value={hero.bg_image || null}
              onChange={(url) => update("hero.bg_image", url || "")}
              hint="Optional. If empty, only the gradient background is shown."
            />

            <FocalPointPicker
              imageUrl={hero.bg_image}
              x={hero.bg_image_focal_x}
              y={hero.bg_image_focal_y}
              onChange={(x, y) => {
                update("hero.bg_image_focal_x", x);
                update("hero.bg_image_focal_y", y);
              }}
            />

            <div className="grid grid-cols-3 gap-3">
              <ColorField
                label="Gradient Start"
                value={hero.gradient_from}
                onChange={(value) => update("hero.gradient_from", value)}
              />
              <ColorField
                label="Gradient Middle"
                value={hero.gradient_via}
                onChange={(value) => update("hero.gradient_via", value)}
              />
              <ColorField
                label="Gradient End"
                value={hero.gradient_to}
                onChange={(value) => update("hero.gradient_to", value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Gradient Direction
                </label>
                <select
                  value={hero.gradient_direction}
                  onChange={(event) => update("hero.gradient_direction", event.target.value)}
                  className={inputClass}
                >
                  <option value="to-br">Top Left → Bottom Right</option>
                  <option value="to-b">Top → Bottom</option>
                  <option value="to-r">Left → Right</option>
                  <option value="to-bl">Top Right → Bottom Left</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Overlay Opacity ({hero.gradient_opacity}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={hero.gradient_opacity}
                  onChange={(event) => update("hero.gradient_opacity", Number(event.target.value))}
                  className="w-full accent-primary"
                />
              </div>
            </div>

            <HeroPreview hero={hero} />
          </div>
        </Section>

        <Section
          title="SEO Settings"
          isOpen={openSection === "seo"}
          onToggle={() => setOpenSection(openSection === "seo" ? "" : "seo")}
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
                  value={seo.slug}
                  disabled
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50 text-gray-500"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Core page route slug is fixed in routing.
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
                onChange={(event) => setFocusKeyphrase(event.target.value)}
                className={inputClass}
                placeholder="e.g. contact zion travel"
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
                onChange={(event) => setMetaTitle(event.target.value)}
                className={inputClass}
                placeholder="SEO title for /contact"
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
                onChange={(event) => setMetaDescription(event.target.value)}
                className={inputClass}
                placeholder="SEO description for /contact"
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
              url={`${siteConfig.siteUrl}/${seo.slug}`}
              description={metaDescription}
              image={ogImage || hero.bg_image || null}
            />

            <SeoScorecard
              contentType="page"
              focusKeyphrase={focusKeyphrase}
              metaTitle={metaTitle}
              metaDescription={metaDescription}
              slug={seo.slug}
              bodyHtml={seoBodyHtml}
              featuredImage={ogImage || hero.bg_image || ""}
            />
          </div>
        </Section>

        <div className="pt-4">
          <button
            type="submit"
            className="px-6 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Save Contact Page
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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
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
  onChange: (value: string) => void;
  inputClass: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-14 p-1 border border-gray-300 rounded-lg bg-white"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}

function HeroPreview({
  hero,
}: {
  hero: {
    title: string;
    subtitle: string;
    bg_image?: string;
    bg_image_focal_x?: number;
    bg_image_focal_y?: number;
    gradient_from?: string;
    gradient_via?: string;
    gradient_to?: string;
    gradient_opacity?: number;
    gradient_direction?: string;
    title_color?: string;
    subtitle_color?: string;
  };
}) {
  const from = hero.gradient_from || "#111827";
  const via = hero.gradient_via || "#1f2937";
  const to = hero.gradient_to || "#111827";
  const opacity =
    typeof hero.gradient_opacity === "number" ? hero.gradient_opacity : 100;
  const dir = hero.gradient_direction || "to-br";
  const directionCss: Record<string, string> = {
    "to-br": "to bottom right",
    "to-b": "to bottom",
    "to-r": "to right",
    "to-bl": "to bottom left",
  };
  const gradientBg =
    dir === "radial"
      ? `radial-gradient(circle, ${from}, ${via}, ${to})`
      : `linear-gradient(${directionCss[dir] || "to bottom right"}, ${from}, ${via}, ${to})`;

  return (
    <div className="relative h-36 rounded-lg overflow-hidden border border-gray-200">
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
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <p
          className="font-black tracking-wide text-xl"
          style={{ color: hero.title_color || "#ffffff" }}
        >
          {hero.title}
        </p>
        <p className="text-xs mt-1" style={{ color: hero.subtitle_color || "#d1d5db" }}>
          {hero.subtitle}
        </p>
      </div>
    </div>
  );
}
