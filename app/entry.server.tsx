import { PassThrough } from "node:stream";

import type { AppLoadContext, EntryContext } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { lookupRedirect, handleRedirectHit } from "./lib/redirect-cache.server";

export const streamTimeout = 5_000;

// Store last error for debug endpoint
let _lastError: { pathname: string; message: string; stack: string; time: string } | null = null;
export function getLastError() { return _lastError; }

export function handleError(
  error: unknown,
  { request }: { request: Request }
) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack || "" : "";
  _lastError = { pathname, message, stack, time: new Date().toISOString() };
  console.error(`[handleError] ${request.method} ${pathname}`);
  console.error(`[handleError] message: ${message}`);
  console.error(`[handleError] stack: ${stack}`);
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext
) {
  // ── Trailing-slash redirect ──────────────────────────────
  // Old WordPress site used trailing slashes on every URL.
  // Strip them so Google's index seamlessly transitions to the new site.
  const url = new URL(request.url);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    const newUrl = url.pathname.slice(0, -1) + url.search;
    return new Response(null, {
      status: 301,
      headers: { Location: newUrl },
    });
  }

  // ── Database redirect lookup ────────────────────────────
  // Check for custom 301/302 redirects stored in the DB
  // before React Router handles the request.
  const redirectMatch = await lookupRedirect(url.pathname);
  if (redirectMatch) {
    handleRedirectHit(redirectMatch.id);
    return new Response(null, {
      status: redirectMatch.code,
      headers: { Location: redirectMatch.to + url.search },
    });
  }

  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");

    let readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );
  });
}
