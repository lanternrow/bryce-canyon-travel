import { Link, useLoaderData, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-settings";
import { useState } from "react";
import { requireAuth } from "../lib/auth.server";
import { getSettings, updateSetting } from "../lib/queries.server";
import ImageUploader from "../components/ImageUploader";
import { siteConfig, COLOR_PALETTE } from "../lib/site-config";

export function meta() {
  return [{ title: `Settings | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const settings = await getSettings();
  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "general";
  return { settings, tab };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const tab = formData.get("tab") as string;

  const entries = Array.from(formData.entries()).filter(
    ([key]) => key !== "tab" && key !== "intent"
  );

  for (const [key, value] of entries) {
    await updateSetting(key, value as string);
  }

  return redirect(`/admin/settings?toast=Settings+saved&tab=${tab}`);
}

type Tab = "general" | "seo" | "social" | "contact" | "footer" | "api" | "appearance";

const allTabs: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "seo", label: "SEO" },
  { id: "social", label: "Social" },
  { id: "contact", label: "Contact" },
  { id: "footer", label: "Footer" },
  { id: "api", label: "API" },
  { id: "appearance", label: "Appearance" },
];

const DEFAULT_COLORS = COLOR_PALETTE;

const FONT_OPTIONS = [
  "Inter", "Lora", "Merriweather", "Montserrat", "Open Sans",
  "Playfair Display", "Poppins", "Raleway", "Roboto", "Source Serif Pro",
];

const WEIGHT_OPTIONS = ["300", "400", "500", "600", "700", "800", "900"];

export default function AdminSettings() {
  const { settings, tab: initialTab } = useLoaderData<typeof loader>();
  const s = settings as Record<string, string>;
  const [activeTab, setActiveTab] = useState<Tab>((initialTab as Tab) || "general");

  // General
  const [siteTitle, setSiteTitle] = useState(s.site_title || siteConfig.siteName);
  const [tagline, setTagline] = useState(s.tagline || siteConfig.tagline);
  const [adminEmail, setAdminEmail] = useState(s.admin_email || siteConfig.contactEmail);
  const [timezone, setTimezone] = useState(s.timezone || "America/Denver");
  // Logo state moved to Appearance section below

  // SEO
  const [titleTemplate, setTitleTemplate] = useState(s.title_template || siteConfig.defaults.titleTemplate);
  const [metaDescription, setMetaDescription] = useState(s.meta_description || siteConfig.defaults.metaDescription);
  const [ogImageUrl, setOgImageUrl] = useState(s.og_image_url || "");
  const [allowIndexing, setAllowIndexing] = useState(s.allow_indexing !== "false");

  // Noindex per content type
  const [noindexListings, setNoindexListings] = useState(s.noindex_listings === "true");
  const [noindexDining, setNoindexDining] = useState(s.noindex_dining === "true");
  const [noindexLodging, setNoindexLodging] = useState(s.noindex_lodging === "true");
  const [noindexExperiences, setNoindexExperiences] = useState(s.noindex_experiences === "true");
  const [noindexHiking, setNoindexHiking] = useState(s.noindex_hiking === "true");
  const [noindexTransportation, setNoindexTransportation] = useState(s.noindex_transportation === "true");
  const [noindexBlogPosts, setNoindexBlogPosts] = useState(s.noindex_blog_posts === "true");

  // Social
  const [instagram, setInstagram] = useState(s.instagram || "");
  const [facebook, setFacebook] = useState(s.facebook || "");
  const [youtube, setYoutube] = useState(s.youtube || "");
  const [tiktok, setTiktok] = useState(s.tiktok || "");
  const [twitter, setTwitter] = useState(s.twitter || "");

  // Contact
  const [displayEmail, setDisplayEmail] = useState(s.display_email || "");
  const [phone, setPhone] = useState(s.phone || "");
  const [address, setAddress] = useState(s.address || "");
  const [mapsEmbed, setMapsEmbed] = useState(s.maps_embed || "");

  // Footer
  const [footerTagline, setFooterTagline] = useState(s.footer_tagline || siteConfig.defaults.footerTagline);
  const [footerLocations, setFooterLocations] = useState(s.footer_locations || siteConfig.defaults.footerLocations);
  const [footerNewsletter, setFooterNewsletter] = useState(s.footer_newsletter_text || siteConfig.defaults.footerNewsletter);
  const [footerCopyright, setFooterCopyright] = useState(s.footer_copyright || "");

  // API Keys
  const [customHeadScripts, setCustomHeadScripts] = useState(s.custom_head_scripts || "");
  const [customBodyScripts, setCustomBodyScripts] = useState(s.custom_body_scripts || "");
  const [googlePlacesApiKey, setGooglePlacesApiKey] = useState(s.google_places_api_key || "");
  const [anthropicApiKey, setAnthropicApiKey] = useState(s.anthropic_api_key || "");
  const [aiModel, setAiModel] = useState(s.ai_model || "claude-opus-4-20250514");
  const [npsApiKey, setNpsApiKey] = useState(s.nps_api_key || "");
  const [ridbApiKey, setRidbApiKey] = useState(s.ridb_api_key || "");
  const [pexelsApiKey, setPexelsApiKey] = useState(s.pexels_api_key || "");
  const [mailchimpApiKey, setMailchimpApiKey] = useState(s.mailchimp_api_key || "");
  const [mailchimpServerPrefix, setMailchimpServerPrefix] = useState(s.mailchimp_server_prefix || "");
  const [mailchimpAudienceId, setMailchimpAudienceId] = useState(s.mailchimp_audience_id || "");
  // Colors
  const [colors, setColors] = useState<Record<string, string>>(() => {
    const c: Record<string, string> = {};
    for (const [key, meta] of Object.entries(DEFAULT_COLORS)) {
      c[key] = s[key] || meta.default;
    }
    return c;
  });

  // Typography
  const [fontHeading, setFontHeading] = useState(s.font_heading || "Inter");
  const [fontBody, setFontBody] = useState(s.font_body || "Inter");
  const [fontHeadingWeight, setFontHeadingWeight] = useState(s.font_heading_weight || "700");
  const [fontBodyWeight, setFontBodyWeight] = useState(s.font_body_weight || "400");

  // Logos
  const [logoDark, setLogoDark] = useState(s.logo_dark || "");
  const [logoDarkAlt, setLogoDarkAlt] = useState(s.logo_dark_alt || "");
  const [logoDarkTitle, setLogoDarkTitle] = useState(s.logo_dark_title || "");
  const [logoDarkCaption, setLogoDarkCaption] = useState(s.logo_dark_caption || "");
  const [logoDarkDescription, setLogoDarkDescription] = useState(s.logo_dark_description || "");
  const [logoLight, setLogoLight] = useState(s.logo_light || "");
  const [logoLightAlt, setLogoLightAlt] = useState(s.logo_light_alt || "");
  const [logoLightTitle, setLogoLightTitle] = useState(s.logo_light_title || "");
  const [logoLightCaption, setLogoLightCaption] = useState(s.logo_light_caption || "");
  const [logoLightDescription, setLogoLightDescription] = useState(s.logo_light_description || "");

  // Favicon
  const [faviconUrl, setFaviconUrl] = useState(s.favicon_url || "");
  const [faviconAlt, setFaviconAlt] = useState(s.favicon_alt || "");

  // AI generation for logos & favicon
  const [aiLoadingLogo, setAiLoadingLogo] = useState<string | null>(null);

  const handleLogoAiGenerate = async (variant: "dark" | "light", field: "alt") => {
    const url = variant === "dark" ? logoDark : logoLight;
    if (!url) return;
    const key = `${variant}-${field}`;
    setAiLoadingLogo(key);
    try {
      const res = await fetch("/api/ai-image-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, field }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.altText) {
        if (variant === "dark") setLogoDarkAlt(data.altText);
        else setLogoLightAlt(data.altText);
      }
    } catch {
      alert("AI generation failed. Please try again.");
    } finally {
      setAiLoadingLogo(null);
    }
  };

  const handleFaviconAiGenerate = async () => {
    if (!faviconUrl) return;
    setAiLoadingLogo("favicon-alt");
    try {
      const res = await fetch("/api/ai-image-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: faviconUrl, field: "alt" }),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.altText) {
        setFaviconAlt(data.altText);
      }
    } catch {
      alert("AI generation failed. Please try again.");
    } finally {
      setAiLoadingLogo(null);
    }
  };

  const ic = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary";

  return (
    <div className="px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <span>Settings</span>
      </div>
      <h1 className="text-3xl font-bold text-dark mb-8">Settings</h1>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-8 border-b border-gray-200 pb-px overflow-x-auto">
        {allTabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === tab.id ? "bg-white text-primary border border-gray-200 border-b-white -mb-px" : "text-gray-500 hover:text-dark hover:bg-gray-50"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="max-w-2xl">
        {/* GENERAL */}
        {activeTab === "general" && (
          <Form method="post"><input type="hidden" name="tab" value="general" />
            <div className="bg-white border border-gray-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-dark mb-5">General Settings</h2>
              <div className="space-y-5">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Site Title</label><input type="text" name="site_title" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} className={ic} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label><input type="text" name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} className={ic} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label><input type="email" name="admin_email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className={ic} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                  <select name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={`${ic} bg-white`}>
                    <option value="America/New_York">Eastern (ET)</option><option value="America/Chicago">Central (CT)</option><option value="America/Denver">Mountain (MT)</option><option value="America/Los_Angeles">Pacific (PT)</option>
                  </select></div>
                <div className="pt-2"><button type="submit" className="px-5 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors">Save Changes</button></div>
              </div></div>
          </Form>
        )}

        {/* SEO */}
        {activeTab === "seo" && (
          <Form method="post"><input type="hidden" name="tab" value="seo" />
            <div className="bg-white border border-gray-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-dark mb-5">SEO Settings</h2>
              <div className="space-y-5">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Default Title Template</label><input type="text" name="title_template" value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} className={`${ic} font-mono text-sm`} /><p className="text-xs text-gray-400 mt-1">Use %page_title% as a placeholder.</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Meta Description</label><textarea rows={3} name="meta_description" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} className={`${ic} resize-none`} /><p className="text-xs text-gray-400 mt-1">{metaDescription.length}/160</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">OG Image URL</label><input type="url" name="og_image_url" value={ogImageUrl} onChange={(e) => setOgImageUrl(e.target.value)} placeholder="https://..." className={ic} /></div>
                <div className="flex items-center justify-between py-2">
                  <div><span className="text-sm font-medium text-gray-700">Allow Search Engine Indexing</span></div>
                  <button type="button" onClick={() => setAllowIndexing(!allowIndexing)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${allowIndexing ? "bg-primary" : "bg-gray-300"}`}><span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${allowIndexing ? "translate-x-6" : "translate-x-1"}`} /></button>
                  <input type="hidden" name="allow_indexing" value={allowIndexing ? "true" : "false"} />
                </div>
              </div></div>

            <div className="bg-white border border-gray-200 rounded-lg p-6 mt-6">
              <h2 className="text-lg font-semibold text-dark mb-1">
                Directory Page Controls
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Directory pages now live under Admin Pages so each page has hero
                controls, focus keyphrase, and SEO settings in one place.
              </p>
              <Link
                to="/admin/pages"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Manage Directory Pages
              </Link>
            </div>

            {/* Noindex per Content Type */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 mt-6">
              <h2 className="text-lg font-semibold text-dark mb-1">Noindex by Content Type</h2>
              <p className="text-xs text-gray-500 mb-5">Add <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">noindex, follow</code> to all pages of a content type. Search engines will stop indexing these pages but will still follow their links.</p>
              <div className="space-y-3">
                {([
                  { key: "listings", label: "All Listings Directory", state: noindexListings, setter: setNoindexListings },
                  { key: "dining", label: "Dining Listings", state: noindexDining, setter: setNoindexDining },
                  { key: "lodging", label: "Lodging Listings", state: noindexLodging, setter: setNoindexLodging },
                  { key: "experiences", label: "Experience Listings", state: noindexExperiences, setter: setNoindexExperiences },
                  { key: "hiking", label: "Hiking Listings", state: noindexHiking, setter: setNoindexHiking },
                  { key: "transportation", label: "Transportation Listings", state: noindexTransportation, setter: setNoindexTransportation },
                  { key: "blog_posts", label: "News Articles", state: noindexBlogPosts, setter: setNoindexBlogPosts },
                ] as const).map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-gray-700">{item.label}</span>
                    <button type="button" onClick={() => item.setter(!item.state)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.state ? "bg-red-500" : "bg-gray-300"}`}>
                      <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${item.state ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                    <input type="hidden" name={`noindex_${item.key}`} value={item.state ? "true" : "false"} />
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4"><button type="submit" className="px-5 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors">Save Changes</button></div>
          </Form>
        )}

        {/* SOCIAL */}
        {activeTab === "social" && (
          <Form method="post"><input type="hidden" name="tab" value="social" />
            <div className="bg-white border border-gray-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-dark mb-5">Social Media Links</h2>
              <div className="space-y-5">
                {[{ l: "Instagram", n: "instagram", v: instagram, s: setInstagram }, { l: "Facebook", n: "facebook", v: facebook, s: setFacebook }, { l: "YouTube", n: "youtube", v: youtube, s: setYoutube }, { l: "TikTok", n: "tiktok", v: tiktok, s: setTiktok }, { l: "Twitter / X", n: "twitter", v: twitter, s: setTwitter }].map((f) => (
                  <div key={f.n}><label className="block text-sm font-medium text-gray-700 mb-1">{f.l}</label><input type="url" name={f.n} value={f.v} onChange={(e) => f.s(e.target.value)} className={ic} /></div>
                ))}
                <div className="pt-2"><button type="submit" className="px-5 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors">Save Changes</button></div>
              </div></div>
          </Form>
        )}

        {/* CONTACT */}
        {activeTab === "contact" && (
          <Form method="post"><input type="hidden" name="tab" value="contact" />
            <div className="bg-white border border-gray-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-dark mb-5">Contact Information</h2>
              <div className="space-y-5">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Display Email</label><input type="email" name="display_email" value={displayEmail} onChange={(e) => setDisplayEmail(e.target.value)} className={ic} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label><input type="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={ic} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><textarea rows={3} name="address" value={address} onChange={(e) => setAddress(e.target.value)} className={`${ic} resize-none`} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Google Maps Embed URL</label><input type="url" name="maps_embed" value={mapsEmbed} onChange={(e) => setMapsEmbed(e.target.value)} className={ic} /></div>
                <div className="pt-2"><button type="submit" className="px-5 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors">Save Changes</button></div>
              </div></div>
          </Form>
        )}

        {/* FOOTER */}
        {activeTab === "footer" && (
          <Form method="post"><input type="hidden" name="tab" value="footer" />
            <div className="bg-white border border-gray-200 rounded-lg p-6"><h2 className="text-lg font-semibold text-dark mb-5">Footer Content</h2>
              <div className="space-y-5">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Brand Tagline</label><textarea rows={3} name="footer_tagline" value={footerTagline} onChange={(e) => setFooterTagline(e.target.value)} className={`${ic} resize-none`} /><p className="text-xs text-gray-400 mt-1">Appears under the logo.</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Location Names</label><input type="text" name="footer_locations" value={footerLocations} onChange={(e) => setFooterLocations(e.target.value)} className={ic} /><p className="text-xs text-gray-400 mt-1">Comma-separated (e.g., {siteConfig.gatewayTowns.join(",")})</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Newsletter Text</label><input type="text" name="footer_newsletter_text" value={footerNewsletter} onChange={(e) => setFooterNewsletter(e.target.value)} className={ic} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Copyright Text</label><input type="text" name="footer_copyright" value={footerCopyright} onChange={(e) => setFooterCopyright(e.target.value)} className={ic} placeholder="Leave blank for auto-generated" /></div>
                <div className="pt-2"><button type="submit" className="px-5 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors">Save Changes</button></div>
              </div></div>
          </Form>
        )}

        {/* API */}
        {activeTab === "api" && (
          <Form method="post"><input type="hidden" name="tab" value="api" />
            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6"><h2 className="text-lg font-semibold text-dark">API Keys & Integrations</h2>
              <div className="space-y-5">
                <h3 className="text-md font-semibold text-dark">Google Reviews</h3>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Google Places API Key</label><input type="text" name="google_places_api_key" value={googlePlacesApiKey} onChange={(e) => setGooglePlacesApiKey(e.target.value)} placeholder="AIza..." className={`${ic} font-mono`} /><p className="text-xs text-gray-400 mt-1">Powers the Google Reviews display on listing pages. Get a key from the <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Cloud Console</a>.</p></div>
              </div>
              <hr className="border-gray-200" />
              <div className="space-y-5">
                <h3 className="text-md font-semibold text-dark">Stock Photos</h3>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Pexels API Key</label><input type="password" name="pexels_api_key" value={pexelsApiKey} onChange={(e) => setPexelsApiKey(e.target.value)} placeholder="Your Pexels API key" className={`${ic} font-mono`} /><p className="text-xs text-gray-400 mt-1">Free from <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">pexels.com/api</a>. Powers the stock photo search and import in the Media Library.</p></div>
              </div>
              <hr className="border-gray-200" />
              <div className="space-y-5">
                <h3 className="text-md font-semibold text-dark">AI Content Generation</h3>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Anthropic API Key</label><input type="password" name="anthropic_api_key" value={anthropicApiKey} onChange={(e) => setAnthropicApiKey(e.target.value)} placeholder="sk-ant-..." className={`${ic} font-mono`} /><p className="text-xs text-gray-400 mt-1">Powers AI-generated listing descriptions and taglines via Claude. Get a key from the <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Anthropic Console</a>.</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">AI Model</label><input type="text" name="ai_model" value={aiModel} onChange={(e) => setAiModel(e.target.value)} className={`${ic} font-mono text-sm`} /><p className="text-xs text-gray-400 mt-1">Uses the latest Claude Opus model. Update the model name when Anthropic releases new versions.</p></div>
              </div>
              <hr className="border-gray-200" />
              <div className="space-y-5">
                <h3 className="text-md font-semibold text-dark">Hiking Trail Data (NPS &amp; Recreation.gov)</h3>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">NPS API Key</label><input type="password" name="nps_api_key" value={npsApiKey} onChange={(e) => setNpsApiKey(e.target.value)} placeholder="Your NPS API key" className={`${ic} font-mono`} /><p className="text-xs text-gray-400 mt-1">Free from <a href="https://developer.nps.gov/get-started" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">developer.nps.gov</a>. Powers trail descriptions, park alerts, and activity data for hiking listings.</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Recreation.gov API Key (RIDB)</label><input type="password" name="ridb_api_key" value={ridbApiKey} onChange={(e) => setRidbApiKey(e.target.value)} placeholder="Your RIDB API key" className={`${ic} font-mono`} /><p className="text-xs text-gray-400 mt-1">Free from <a href="https://ridb.recreation.gov" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ridb.recreation.gov</a>. Powers permit details, fees, and campground data.</p></div>
                <p className="text-xs text-gray-400">OpenStreetMap trail data (distance, difficulty) requires no API key.</p>
              </div>
              <hr className="border-gray-200" />
              <div className="space-y-5">
                <h3 className="text-md font-semibold text-dark">Mailchimp Newsletter</h3>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">API Key</label><input type="password" name="mailchimp_api_key" value={mailchimpApiKey} onChange={(e) => setMailchimpApiKey(e.target.value)} placeholder="xxxxxxxxxxxxxxxx-us2" className={`${ic} font-mono`} /><p className="text-xs text-gray-400 mt-1">Found in Mailchimp → Profile → Extras → API keys. Format: <code className="bg-gray-100 px-1 rounded">key-serverprefix</code></p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Server Prefix</label><input type="text" name="mailchimp_server_prefix" value={mailchimpServerPrefix} onChange={(e) => setMailchimpServerPrefix(e.target.value)} placeholder="us2" className={`${ic} font-mono w-32`} /><p className="text-xs text-gray-400 mt-1">The part after the dash in your API key (e.g., "us2"). Auto-detected from the API key if left blank.</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Audience ID</label><input type="text" name="mailchimp_audience_id" value={mailchimpAudienceId} onChange={(e) => setMailchimpAudienceId(e.target.value)} placeholder="abc1234def" className={`${ic} font-mono`} /><p className="text-xs text-gray-400 mt-1">Found in Mailchimp → Audience → Settings → Audience name and defaults. Also called "List ID".</p></div>
              </div>
              <hr className="border-gray-200" />
              <div className="space-y-5">
                <h3 className="text-md font-semibold text-dark">Custom Scripts</h3>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Custom Head Scripts</label><textarea rows={4} name="custom_head_scripts" value={customHeadScripts} onChange={(e) => setCustomHeadScripts(e.target.value)} placeholder="<script>...</script>" className={`${ic} font-mono text-xs resize-none`} /><p className="text-xs text-gray-400 mt-1">Injected in &lt;head&gt;. Public pages only.</p></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Custom Body Scripts</label><textarea rows={4} name="custom_body_scripts" value={customBodyScripts} onChange={(e) => setCustomBodyScripts(e.target.value)} placeholder="<script>...</script>" className={`${ic} font-mono text-xs resize-none`} /><p className="text-xs text-gray-400 mt-1">Injected before &lt;/body&gt;. Public pages only.</p></div>
                <div className="pt-2"><button type="submit" className="px-5 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors">Save Changes</button></div>
              </div></div>
          </Form>
        )}

        {/* APPEARANCE */}
        {activeTab === "appearance" && (
          <Form method="post"><input type="hidden" name="tab" value="appearance" />
            {/* Site Logos */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-dark mb-1">Site Logos</h2>
              <p className="text-xs text-gray-500 mb-5">Upload two versions of your logo. The dark logo appears on light backgrounds (header, login). The light logo appears on dark backgrounds (footer, admin sidebar).</p>

              <div className="grid grid-cols-2 gap-6">
                {/* Dark Logo */}
                <div className="space-y-4">
                  <ImageUploader
                    value={logoDark || null}
                    onChange={(url) => setLogoDark(url || "")}
                    label="Dark Logo (for light backgrounds)"
                    hint="Used in the site header and admin login page."
                  />
                  <input type="hidden" name="logo_dark" value={logoDark} />
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-500">Alt Text <span className="text-primary">*</span></label>
                      {logoDark && (
                        <button type="button" onClick={() => handleLogoAiGenerate("dark", "alt")} disabled={aiLoadingLogo === "dark-alt"} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait" title="AI-generate SEO alt text">
                          {aiLoadingLogo === "dark-alt" ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                          )}
                          AI Generate
                        </button>
                      )}
                    </div>
                    <input type="text" name="logo_dark_alt" value={logoDarkAlt} onChange={(e) => setLogoDarkAlt(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary" placeholder={`${siteConfig.siteName} logo`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                    <input type="text" name="logo_dark_title" value={logoDarkTitle} onChange={(e) => setLogoDarkTitle(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary" placeholder="Shown on hover" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Caption</label>
                    <input type="text" name="logo_dark_caption" value={logoDarkCaption} onChange={(e) => setLogoDarkCaption(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary" placeholder="Optional caption" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <textarea rows={2} name="logo_dark_description" value={logoDarkDescription} onChange={(e) => setLogoDarkDescription(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary resize-none" placeholder="Internal notes..." />
                  </div>
                </div>

                {/* Light Logo */}
                <div className="space-y-4">
                  <ImageUploader
                    value={logoLight || null}
                    onChange={(url) => setLogoLight(url || "")}
                    label="Light Logo (for dark backgrounds)"
                    hint="Used in the site footer and admin sidebar."
                  />
                  <input type="hidden" name="logo_light" value={logoLight} />
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-gray-500">Alt Text <span className="text-primary">*</span></label>
                      {logoLight && (
                        <button type="button" onClick={() => handleLogoAiGenerate("light", "alt")} disabled={aiLoadingLogo === "light-alt"} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait" title="AI-generate SEO alt text">
                          {aiLoadingLogo === "light-alt" ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                          )}
                          AI Generate
                        </button>
                      )}
                    </div>
                    <input type="text" name="logo_light_alt" value={logoLightAlt} onChange={(e) => setLogoLightAlt(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary" placeholder={`${siteConfig.siteName} logo`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
                    <input type="text" name="logo_light_title" value={logoLightTitle} onChange={(e) => setLogoLightTitle(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary" placeholder="Shown on hover" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Caption</label>
                    <input type="text" name="logo_light_caption" value={logoLightCaption} onChange={(e) => setLogoLightCaption(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary" placeholder="Optional caption" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <textarea rows={2} name="logo_light_description" value={logoLightDescription} onChange={(e) => setLogoLightDescription(e.target.value)} className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary resize-none" placeholder="Internal notes..." />
                  </div>
                </div>
              </div>
            </div>

            {/* Favicon */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-dark mb-1">Favicon</h2>
              <p className="text-xs text-gray-500 mb-5">
                Upload a square image (recommended 512×512 PNG) used as the browser tab icon,
                bookmark icon, and Apple touch icon.
              </p>

              <div className="max-w-xs space-y-4">
                <ImageUploader
                  value={faviconUrl || null}
                  onChange={(url) => setFaviconUrl(url || "")}
                  label="Favicon Image"
                  hint="Square PNG or SVG, at least 180×180px."
                />
                <input type="hidden" name="favicon_url" value={faviconUrl} />

                {/* Alt Text with AI Generate */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-500">
                      Alt Text <span className="text-primary">*</span>
                    </label>
                    {faviconUrl && (
                      <button
                        type="button"
                        onClick={handleFaviconAiGenerate}
                        disabled={aiLoadingLogo === "favicon-alt"}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-violet-600 bg-violet-50 rounded-full hover:bg-violet-100 transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="AI-generate SEO alt text"
                      >
                        {aiLoadingLogo === "favicon-alt" ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                          </svg>
                        )}
                        AI Generate
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    name="favicon_alt"
                    value={faviconAlt}
                    onChange={(e) => setFaviconAlt(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary"
                    placeholder={`${siteConfig.siteName} favicon`}
                  />
                </div>

                {/* Live browser tab preview */}
                {faviconUrl && (
                  <div>
                    <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">
                      Browser Tab Preview
                    </p>
                    <div className="inline-flex items-center gap-2 bg-gray-100 rounded-t-lg px-3 py-2 border border-gray-200 border-b-0">
                      <img
                        src={faviconUrl}
                        alt={faviconAlt || "Favicon preview"}
                        className="w-4 h-4 object-contain flex-shrink-0"
                      />
                      <span className="text-xs text-gray-600 truncate max-w-[160px]">
                        {siteTitle || siteConfig.siteName}
                      </span>
                      <svg className="w-3 h-3 text-gray-300 flex-shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Color Palette */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-dark">Color Palette</h2>
                <button type="button" onClick={() => { const r: Record<string, string> = {}; for (const [k, m] of Object.entries(DEFAULT_COLORS)) r[k] = m.default; setColors(r); }} className="text-xs text-gray-500 hover:text-primary transition-colors">Reset to Defaults</button>
              </div>
              <div className="flex gap-1 mb-6 rounded-lg overflow-hidden h-10">
                {Object.entries(colors).map(([k, v]) => (<div key={k} className="flex-1" style={{ backgroundColor: v }} title={DEFAULT_COLORS[k]?.label} />))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(DEFAULT_COLORS).map(([key, meta]) => (
                  <div key={key}><label className="block text-xs font-medium text-gray-500 mb-1">{meta.label}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} className="w-10 h-10 border border-gray-300 rounded cursor-pointer" />
                      <input type="text" name={key} value={colors[key]} onChange={(e) => setColors({ ...colors, [key]: e.target.value })} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:border-primary" />
                    </div></div>
                ))}
              </div>
            </div>

            {/* Typography */}
            <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-dark mb-5">Typography</h2>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Heading Font</label><select name="font_heading" value={fontHeading} onChange={(e) => setFontHeading(e.target.value)} className={`${ic} bg-white`}>{FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Heading Weight</label><select name="font_heading_weight" value={fontHeadingWeight} onChange={(e) => setFontHeadingWeight(e.target.value)} className={`${ic} bg-white`}>{WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Body Font</label><select name="font_body" value={fontBody} onChange={(e) => setFontBody(e.target.value)} className={`${ic} bg-white`}>{FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Body Weight</label><select name="font_body_weight" value={fontBodyWeight} onChange={(e) => setFontBodyWeight(e.target.value)} className={`${ic} bg-white`}>{WEIGHT_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}</select></div>
                </div>
                <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                  <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wider">Preview</p>
                  <h3 style={{ fontFamily: `"${fontHeading}", sans-serif`, fontWeight: Number(fontHeadingWeight) }} className="text-2xl text-dark mb-2">Heading Preview Text</h3>
                  <p style={{ fontFamily: `"${fontBody}", sans-serif`, fontWeight: Number(fontBodyWeight) }} className="text-base text-gray-600 leading-relaxed">The quick brown fox jumps over the lazy dog. This is how your body text will appear across the site.</p>
                </div>
              </div>
            </div>

            <div className="pt-2"><button type="submit" className="px-5 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors">Save Appearance</button></div>
          </Form>
        )}
      </div>
    </div>
  );
}
