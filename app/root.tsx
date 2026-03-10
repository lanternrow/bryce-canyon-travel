import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
  useLocation,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { getSettings } from "./lib/queries.server";
import { getMenuForLocation, type ResolvedMenuItem } from "./lib/menus.server";
import { siteConfig, COLOR_SETTINGS_TO_CSS, DEFAULT_COLOR_VALUES } from "./lib/site-config";

// ---------------------------------------------------------------------------
// Loader — fetch settings for colors, fonts, tracking, footer + dynamic menus
// ---------------------------------------------------------------------------
export async function loader({}: Route.LoaderArgs) {
  const [settings, headerMenu, footerMenu] = await Promise.all([
    getSettings(),
    getMenuForLocation("header"),
    getMenuForLocation("footer"),
  ]);
  return { settings, headerMenu, footerMenu };
}

// ---------------------------------------------------------------------------
// Links — preconnect + dynamic Google Fonts
// ---------------------------------------------------------------------------
export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  // Base Inter font always loaded
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

function buildColorCSS(settings: Record<string, string>): string | null {
  const overrides: string[] = [];
  for (const [key, cssVar] of Object.entries(COLOR_SETTINGS_TO_CSS)) {
    const value = settings[key];
    if (value && value !== DEFAULT_COLOR_VALUES[key]) {
      overrides.push(`${cssVar}: ${value};`);
    }
  }
  if (overrides.length === 0) return null;
  return `:root { ${overrides.join(" ")} }`;
}

function buildFontCSS(settings: Record<string, string>): {
  css: string | null;
  fontUrl: string | null;
} {
  const headingFont = settings.font_heading || "Inter";
  const bodyFont = settings.font_body || "Inter";
  const headingWeight = settings.font_heading_weight || "700";
  const bodyWeight = settings.font_body_weight || "400";

  // Build Google Fonts URL for non-Inter fonts
  const fontsToLoad: string[] = [];
  if (headingFont !== "Inter") {
    fontsToLoad.push(
      `family=${headingFont.replace(/ /g, "+")}:wght@${headingWeight}`
    );
  }
  if (bodyFont !== "Inter" && bodyFont !== headingFont) {
    fontsToLoad.push(
      `family=${bodyFont.replace(/ /g, "+")}:wght@${bodyWeight}`
    );
  }

  const fontUrl =
    fontsToLoad.length > 0
      ? `https://fonts.googleapis.com/css2?${fontsToLoad.join("&")}&display=swap`
      : null;

  // Build CSS overrides
  const cssRules: string[] = [];
  if (bodyFont !== "Inter") {
    cssRules.push(
      `:root { --font-sans: "${bodyFont}", ui-sans-serif, system-ui, sans-serif; }`
    );
  }
  if (headingFont !== "Inter") {
    cssRules.push(
      `h1, h2, h3, h4, h5, h6 { font-family: "${headingFont}", ui-sans-serif, system-ui, sans-serif; font-weight: ${headingWeight}; }`
    );
  }

  return {
    css: cssRules.length > 0 ? cssRules.join("\n") : null,
    fontUrl,
  };
}

// ---------------------------------------------------------------------------
// Favicon — detect MIME type from URL extension
// ---------------------------------------------------------------------------
function getFaviconInfo(s: Record<string, string>): { url: string; type: string } | null {
  const url = s.favicon_url;
  if (!url) return null;
  const ext = url.split(".").pop()?.toLowerCase() || "";
  const typeMap: Record<string, string> = {
    ico: "image/x-icon",
    png: "image/png",
    svg: "image/svg+xml",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return { url, type: typeMap[ext] || "image/png" };
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Admin pages render their own sidebar layout — skip public Header/Footer
  let isAdmin = false;
  try {
    const location = useLocation();
    isAdmin = location.pathname.startsWith("/admin");
  } catch {
    // useLocation may throw during error boundaries — fall back to false
  }

  // Access root loader data for settings + menus injection
  let settings: Record<string, string> = {};
  let headerMenu: ResolvedMenuItem[] | null = null;
  let footerMenu: ResolvedMenuItem[] | null = null;
  try {
    const data = useRouteLoaderData("root") as
      | { settings: Record<string, string>; headerMenu?: ResolvedMenuItem[] | null; footerMenu?: ResolvedMenuItem[] | null }
      | undefined;
    if (data?.settings) {
      settings = data.settings;
    }
    if (data?.headerMenu) {
      headerMenu = data.headerMenu;
    }
    if (data?.footerMenu) {
      footerMenu = data.footerMenu;
    }
  } catch {
    // May not be available during error boundary rendering
  }

  // Build CSS overrides for colors and fonts
  const colorCSS = buildColorCSS(settings);
  const { css: fontCSS, fontUrl: dynamicFontUrl } = buildFontCSS(settings);

  // Tracking IDs (only injected on public pages)
  const ga4Id = !isAdmin ? settings.ga4_measurement_id : undefined;
  const gscVerification = !isAdmin ? settings.gsc_verification : undefined;
  const fbPixelId = !isAdmin ? settings.facebook_pixel_id : undefined;
  const customHeadScripts = !isAdmin ? settings.custom_head_scripts : undefined;
  const customBodyScripts = !isAdmin ? settings.custom_body_scripts : undefined;

  // Logo URLs and alt text
  const logoDark = settings.logo_dark || undefined;
  const logoDarkAlt = settings.logo_dark_alt || siteConfig.siteName;
  const logoLight = settings.logo_light || undefined;
  const logoLightAlt = settings.logo_light_alt || siteConfig.siteName;

  // Favicon
  const faviconInfo = getFaviconInfo(settings);

  // Footer settings
  const footerSettings = !isAdmin
    ? {
        tagline: settings.footer_tagline,
        locations: settings.footer_locations,
        newsletterText: settings.footer_newsletter_text,
        copyright: settings.footer_copyright,
        instagram: settings.instagram,
        facebook: settings.facebook,
        youtube: settings.youtube,
        logoLight,
        logoLightAlt,
      }
    : undefined;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* Google Search Console verification */}
        {gscVerification && (
          <meta name="google-site-verification" content={gscVerification} />
        )}

        <Meta />
        <Links />

        {/* Favicon */}
        {faviconInfo ? (
          <>
            <link rel="icon" type={faviconInfo.type} href={faviconInfo.url} />
            <link rel="icon" type={faviconInfo.type} sizes="32x32" href={faviconInfo.url} />
            <link rel="apple-touch-icon" sizes="180x180" href={faviconInfo.url} />
          </>
        ) : (
          <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        )}

        {/* Dynamic Google Fonts for custom typography */}
        {dynamicFontUrl && (
          <link rel="stylesheet" href={dynamicFontUrl} />
        )}

        {/* Color overrides */}
        {colorCSS && <style dangerouslySetInnerHTML={{ __html: colorCSS }} />}

        {/* Typography overrides */}
        {fontCSS && <style dangerouslySetInnerHTML={{ __html: fontCSS }} />}

        {/* GA4 */}
        {ga4Id && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga4Id}');`,
              }}
            />
          </>
        )}

        {/* Facebook Pixel */}
        {fbPixelId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${fbPixelId}');fbq('track','PageView');`,
            }}
          />
        )}

        {/* Custom head scripts */}
        {customHeadScripts && (
          <script
            dangerouslySetInnerHTML={{ __html: customHeadScripts }}
          />
        )}
      </head>
      <body
        className={
          isAdmin ? "min-h-screen bg-gray-50" : "min-h-screen flex flex-col"
        }
      >
        {!isAdmin && <Header logoDark={logoDark} logoDarkAlt={logoDarkAlt} menuItems={headerMenu} />}
        {isAdmin ? children : <main className="flex-1">{children}</main>}
        {!isAdmin && <Footer settings={footerSettings} menuItems={footerMenu} />}
        <ScrollRestoration />
        <Scripts />

        {/* Custom body scripts */}
        {customBodyScripts && (
          <script
            dangerouslySetInnerHTML={{ __html: customBodyScripts }}
          />
        )}
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="text-center max-w-lg mx-auto px-4">
        <h1 className="text-6xl font-black text-dark mb-4">{message}</h1>
        <p className="text-lg text-gray-600 mb-8">{details}</p>
        {isRouteErrorResponse(error) && error.status === 404 && (
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            Back to Home
          </Link>
        )}
        {stack && (
          <pre className="mt-8 w-full p-4 overflow-x-auto text-left text-xs bg-gray-100 rounded-lg">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
