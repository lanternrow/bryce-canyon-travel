import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/admin-login";
import {
  getSession,
  getSessionCookie,
  getAdminUserByEmail,
  verifyPassword,
  createSession,
  destroySession,
  buildSessionCookie,
  buildClearSessionCookie,
  ensureAdminUser,
  ensureBootstrapAdminUser,
  recoverAdminLoginWithBootstrapCredentials,
} from "../lib/auth.server";
import { getSettings } from "../lib/queries.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Log In | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Seed admin user if none exists
  await ensureAdminUser();
  await ensureBootstrapAdminUser();

  // If already logged in, redirect to dashboard
  const user = await getSession(request);
  if (user) throw redirect("/admin/dashboard");

  const settings = await getSettings();
  return { logoDark: settings.logo_dark || null, logoDarkAlt: settings.logo_dark_alt || siteConfig.siteName };
}

export async function action({ request }: Route.ActionArgs) {
  const url = new URL(request.url);

  // Handle logout
  if (url.searchParams.get("logout") === "1") {
    const sessionId = getSessionCookie(request);
    if (sessionId) await destroySession(sessionId);
    return redirect("/admin/login", {
      headers: { "Set-Cookie": buildClearSessionCookie() },
    });
  }

  const formData = await request.formData();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const user = await getAdminUserByEmail(email);
  let sessionUser:
    | { id: string; email: string; name: string | null }
    | null = null;

  if (user) {
    const valid = await verifyPassword(password, user.password_hash);
    if (valid) {
      sessionUser = { id: user.id, email: user.email, name: user.name ?? null };
    }
  }

  // Break-glass recovery path via ADMIN_EMAIL + ADMIN_PASSWORD
  if (!sessionUser) {
    sessionUser = await recoverAdminLoginWithBootstrapCredentials(email, password);
  }

  if (!sessionUser) {
    return { error: "Invalid email or password." };
  }

  const sessionId = await createSession(sessionUser.id);
  const cookie = buildSessionCookie(sessionId);

  return redirect("/admin/dashboard", {
    headers: { "Set-Cookie": cookie },
  });
}

export default function AdminLogin() {
  const actionData = useActionData<typeof action>();
  const { logoDark, logoDarkAlt } = useLoaderData<typeof loader>();
  const error = (actionData as any)?.error;

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          {logoDark ? (
            <img src={logoDark} alt={logoDarkAlt} className="h-14 w-auto mx-auto" />
          ) : (
            <>
              <span className="text-4xl font-black text-dark tracking-tight leading-none">
                {siteConfig.siteName.split(" ")[0]}
              </span>
              <span className="block text-xs font-light tracking-[0.3em] text-sand mt-1">
                {siteConfig.siteName.split(" ").slice(1).join(" ")} ADMIN
              </span>
            </>
          )}
        </div>

        {/* Login Card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8">
          <h1 className="text-xl font-semibold text-dark mb-6 text-center">
            Sign in to your account
          </h1>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <Form method="post" className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="email@email.com"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2.5 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm"
            >
              Sign In
            </button>
          </Form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          &copy; {new Date().getFullYear()} {siteConfig.siteName}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
