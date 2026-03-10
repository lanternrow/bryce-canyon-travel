import { useState } from "react";
import { Link } from "react-router";
import type { ResolvedMenuItem } from "../lib/menus.server";
import { siteConfig } from "../lib/site-config";

type FooterSettings = {
  tagline?: string;
  locations?: string;
  newsletterText?: string;
  copyright?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  logoLight?: string;
  logoLightAlt?: string;
};

const DEFAULT_TAGLINE = siteConfig.defaults.footerTagline;
const DEFAULT_LOCATIONS = siteConfig.defaults.footerLocations.split(",").map((s) => s.trim());
const DEFAULT_NEWSLETTER = siteConfig.defaults.footerNewsletter;

const EXPLORE_LINKS = [
  { label: "All Listings", href: "/listings" },
  { label: "Experiences", href: "/experiences" },
  { label: "Hiking", href: "/hiking" },
  { label: "Parks", href: "/parks" },
  { label: "Golf", href: "/golf" },
  { label: "Lodging", href: "/lodging" },
  { label: "Dining", href: "/dining" },
  { label: "Transportation", href: "/transportation" },
];

export default function Footer({ settings, menuItems }: { settings?: FooterSettings; menuItems?: ResolvedMenuItem[] | null }) {
  const tagline = settings?.tagline || DEFAULT_TAGLINE;
  const locations = settings?.locations
    ? settings.locations.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_LOCATIONS;
  const newsletterText = settings?.newsletterText || DEFAULT_NEWSLETTER;

  // Newsletter subscription state
  const [ftEmail, setFtEmail] = useState("");
  const [ftStatus, setFtStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [ftMessage, setFtMessage] = useState("");

  const handleFooterSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ftEmail.trim() || ftStatus === "loading") return;
    setFtStatus("loading");
    try {
      const res = await fetch("/api/newsletter-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ftEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setFtStatus("success");
        setFtMessage(data.message);
        setFtEmail("");
      } else {
        setFtStatus("error");
        setFtMessage(data.message || "Something went wrong.");
      }
    } catch {
      setFtStatus("error");
      setFtMessage("Network error. Please try again.");
    }
  };

  const copyrightText =
    settings?.copyright ||
    `\u00A9 ${new Date().getFullYear()} ${siteConfig.siteName}. All rights reserved.`;

  const instagramUrl = settings?.instagram
    ? settings.instagram.startsWith("http")
      ? settings.instagram
      : `https://instagram.com/${settings.instagram}`
    : "https://instagram.com";
  const facebookUrl = settings?.facebook
    ? settings.facebook.startsWith("http")
      ? settings.facebook
      : `https://facebook.com/${settings.facebook}`
    : "https://facebook.com";
  const youtubeUrl = settings?.youtube
    ? settings.youtube.startsWith("http")
      ? settings.youtube
      : `https://youtube.com/${settings.youtube}`
    : "https://youtube.com";

  return (
    <footer className="bg-dark text-white">
      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            {settings?.logoLight ? (
              <img src={settings.logoLight} alt={settings.logoLightAlt || siteConfig.siteName} className="h-10 w-auto" />
            ) : (
              <span className="text-2xl font-black tracking-tight leading-none">
                {siteConfig.siteName.split(" ")[0]}<br />
                <span className="text-xs font-light tracking-[0.3em] text-sand">{siteConfig.siteName.split(" ").slice(1).join(" ") || "TRAVEL"}</span>
              </span>
            )}
            <p className="mt-4 text-sm text-gray-400 leading-relaxed">
              {tagline}
            </p>
          </div>

          {/* Directories */}
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wider text-sand mb-4">Explore</h3>
            <ul className="space-y-2">
              {(menuItems && menuItems.length > 0
                ? menuItems.map((item) => ({ label: item.label, href: item.url, openInNewTab: item.open_in_new_tab }))
                : EXPLORE_LINKS.map((l) => ({ ...l, openInNewTab: false }))
              ).map((link, i) => (
                <li key={`${link.href}-${i}`}>
                  <Link
                    to={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                    {...(link.openInNewTab ? { target: "_blank", rel: "noopener" } : {})}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Popular Locations */}
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wider text-sand mb-4">Locations</h3>
            <ul className="space-y-2">
              {locations.map((loc) => (
                <li key={loc}>
                  <span className="text-sm text-gray-400">{loc}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact / Newsletter */}
          <div>
            <h3 className="font-semibold text-sm uppercase tracking-wider text-sand mb-4">Stay Connected</h3>
            <p className="text-sm text-gray-400 mb-3">{newsletterText}</p>
            <form onSubmit={handleFooterSubscribe} className="flex gap-2">
              <input
                type="email"
                placeholder="Your email"
                value={ftEmail}
                onChange={(e) => { setFtEmail(e.target.value); if (ftStatus !== "idle") setFtStatus("idle"); }}
                className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-md text-sm text-white placeholder-gray-500 focus:outline-none focus:border-sand"
                required
                disabled={ftStatus === "loading"}
              />
              <button
                type="submit"
                disabled={ftStatus === "loading"}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {ftStatus === "loading" ? "…" : "Join"}
              </button>
            </form>
            {ftMessage && (
              <p className={`mt-2 text-xs ${ftStatus === "success" ? "text-emerald-400" : "text-red-400"}`}>
                {ftMessage}
              </p>
            )}
            <div className="flex items-center gap-4 mt-6">
              <a href={instagramUrl} target="_blank" rel="noopener" className="text-gray-400 hover:text-white transition-colors" aria-label="Instagram">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href={facebookUrl} target="_blank" rel="noopener" className="text-gray-400 hover:text-white transition-colors" aria-label="Facebook">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href={youtubeUrl} target="_blank" rel="noopener" className="text-gray-400 hover:text-white transition-colors" aria-label="YouTube">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 text-center text-xs text-gray-500">
          {copyrightText}
        </div>
      </div>
    </footer>
  );
}
