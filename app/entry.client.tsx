import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// ---------------------------------------------------------------------------
// Pre-hydration cleanup: remove third-party elements injected between
// server render and client hydration (CDN edge scripts, extensions, etc.).
// These extra DOM nodes can cause React hydration mismatches.
// ---------------------------------------------------------------------------

// Remove injected scripts (Cloudflare analytics, browser extensions)
document
  .querySelectorAll(
    'script[src*="cloudflareinsights"], script[src*="beacon.min.js"], script[src*="chrome-extension"]'
  )
  .forEach((el) => el.remove());

// Remove extension-injected DOM elements from body
document
  .querySelectorAll(
    "body > [class*='ue-'], body > [id*='claude-'], body > [data-grammarly], body > grammarly-desktop-integration, body > [class*='extension']"
  )
  .forEach((el) => el.remove());

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    {
      onRecoverableError(error: unknown) {
        // Suppress noisy hydration mismatch warnings in production.
        // These can be caused by browser extensions injecting content into the DOM.
        if (import.meta.env.DEV) {
          console.warn("Hydration error:", error);
        }
      },
    }
  );
});
