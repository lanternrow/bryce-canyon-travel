import { Link, useLocation } from "react-router";
import { useState } from "react";
import type { ResolvedMenuItem } from "../lib/menus.server";
import { siteConfig } from "../lib/site-config";

const defaultNavLinks: NavLink[] = [
  { label: "Things To Do", href: "/experiences", openInNewTab: false, children: [
    { label: "Experiences", href: "/experiences", openInNewTab: false },
    { label: "Hiking", href: "/hiking", openInNewTab: false },
    { label: "Parks", href: "/parks", openInNewTab: false },
    { label: "Golf", href: "/golf", openInNewTab: false },
  ]},
  { label: "Lodging", href: "/lodging", openInNewTab: false, children: [] },
  { label: "Dining", href: "/dining", openInNewTab: false, children: [] },
  { label: "Plan Your Trip", href: "/transportation", openInNewTab: false, children: [
    { label: "Transportation", href: "/transportation", openInNewTab: false },
  ]},
  { label: "News", href: "/news", openInNewTab: false, children: [] },
];

interface NavLink {
  label: string;
  href: string;
  openInNewTab: boolean;
  children: { label: string; href: string; openInNewTab: boolean }[];
}

export default function Header({
  logoDark,
  logoDarkAlt = siteConfig.siteName,
  menuItems,
}: {
  logoDark?: string;
  logoDarkAlt?: string;
  menuItems?: ResolvedMenuItem[] | null;
}) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  // Use dynamic menu if provided, otherwise fall back to hardcoded
  const navLinks: NavLink[] = menuItems && menuItems.length > 0
    ? menuItems.map((item) => ({
        label: item.label,
        href: item.url || "/",
        openInNewTab: item.open_in_new_tab,
        children: item.children?.map((child) => ({
          label: child.label,
          href: child.url || "/",
          openInNewTab: child.open_in_new_tab,
        })) || [],
      }))
    : defaultNavLinks;

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      {/* Top bar */}
      <div className="bg-dark text-white text-sm">
        <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-8">
          <span className="hidden sm:block text-gray-300">
            {siteConfig.tagline}
          </span>
          <div className="flex items-center gap-4 ml-auto">
            <a href="https://instagram.com" target="_blank" rel="noopener" className="hover:text-sand transition-colors" aria-label="Instagram">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            </a>
            <a href="https://facebook.com" target="_blank" rel="noopener" className="hover:text-sand transition-colors" aria-label="Facebook">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
            <a href="https://youtube.com" target="_blank" rel="noopener" className="hover:text-sand transition-colors" aria-label="YouTube">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </a>
            <a href={`mailto:${siteConfig.contactEmail}`} className="hover:text-sand transition-colors text-xs hidden sm:block">{siteConfig.contactEmail}</a>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <nav className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            {logoDark ? (
              <img src={logoDark} alt={logoDarkAlt} className="h-10 w-auto" />
            ) : (
              <span className="text-2xl font-black tracking-tight text-dark leading-none">
                {siteConfig.siteName.split(" ")[0]}<br />
                <span className="text-xs font-light tracking-[0.3em]">{siteConfig.siteName.split(" ").slice(1).join(" ") || "TRAVEL"}</span>
              </span>
            )}
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link, i) => {
              const isActive = location.pathname === link.href ||
                (link.href !== "/" && location.pathname.startsWith(link.href));
              const hasChildren = link.children.length > 0;

              if (hasChildren) {
                return (
                  <div
                    key={`${link.href}-${i}`}
                    className="relative"
                    onMouseEnter={() => setOpenDropdown(link.label)}
                    onMouseLeave={() => setOpenDropdown(null)}
                  >
                    <Link
                      to={link.href}
                      className={`px-3 py-2 text-sm font-medium tracking-wide uppercase transition-colors inline-flex items-center gap-1 ${
                        isActive
                          ? "text-primary"
                          : "text-gray-700 hover:text-primary"
                      }`}
                      {...(link.openInNewTab ? { target: "_blank", rel: "noopener" } : {})}
                    >
                      {link.label}
                      <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </Link>
                    {openDropdown === link.label && (
                      <div className="absolute top-full left-0 mt-0 w-48 bg-white border border-gray-100 rounded-lg shadow-lg py-1 z-50">
                        {link.children.map((child, ci) => (
                          <Link
                            key={`${child.href}-${ci}`}
                            to={child.href}
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-primary transition-colors"
                            {...(child.openInNewTab ? { target: "_blank", rel: "noopener" } : {})}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={`${link.href}-${i}`}
                  to={link.href}
                  className={`px-3 py-2 text-sm font-medium tracking-wide uppercase transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-gray-700 hover:text-primary"
                  }`}
                  {...(link.openInNewTab ? { target: "_blank", rel: "noopener" } : {})}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-md text-gray-700 hover:bg-gray-100"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-100 py-4">
            {navLinks.map((link, i) => {
              const isActive = location.pathname === link.href ||
                (link.href !== "/" && location.pathname.startsWith(link.href));
              const hasChildren = link.children.length > 0;

              return (
                <div key={`${link.href}-${i}`}>
                  <Link
                    to={link.href}
                    onClick={() => !hasChildren && setMobileMenuOpen(false)}
                    className={`block px-3 py-2 text-base font-medium ${
                      isActive ? "text-primary" : "text-gray-700"
                    }`}
                    {...(link.openInNewTab ? { target: "_blank", rel: "noopener" } : {})}
                  >
                    {link.label}
                  </Link>
                  {hasChildren && link.children.map((child, ci) => (
                    <Link
                      key={`${child.href}-${ci}`}
                      to={child.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block pl-8 pr-3 py-1.5 text-sm text-gray-500 hover:text-primary"
                      {...(child.openInNewTab ? { target: "_blank", rel: "noopener" } : {})}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </nav>
    </header>
  );
}
