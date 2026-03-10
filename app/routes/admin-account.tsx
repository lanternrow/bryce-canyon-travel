import { Link, useLoaderData, Form, redirect, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/admin-account";
import { useState } from "react";
import { formatLongDate } from "../lib/format";
import {
  requireAuth,
  getAdminUserById,
  verifyPassword,
  updateAdminPassword,
  updateAdminEmail,
  updateAdminName,
  getAdminUserByEmail,
} from "../lib/auth.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `My Account | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const sessionUser = await requireAuth(request);
  const user = await getAdminUserById(sessionUser.id);
  if (!user) throw redirect("/admin/login");
  return { user };
}

export async function action({ request }: Route.ActionArgs) {
  const sessionUser = await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "update-profile") {
    const name = (formData.get("name") as string).trim();
    const email = (formData.get("email") as string).trim().toLowerCase();

    if (!email) {
      return { error: "Email is required.", intent };
    }

    // Check if email is taken by another user
    const existing = await getAdminUserByEmail(email);
    if (existing && existing.id !== sessionUser.id) {
      return { error: "That email is already in use.", intent };
    }

    await updateAdminEmail(sessionUser.id, email);
    await updateAdminName(sessionUser.id, name || "Admin");
    return redirect("/admin/account?toast=Profile+updated");
  }

  if (intent === "change-password") {
    const currentPassword = formData.get("current_password") as string;
    const newPassword = formData.get("new_password") as string;
    const confirmPassword = formData.get("confirm_password") as string;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return { error: "All password fields are required.", intent };
    }

    if (newPassword.length < 8) {
      return { error: "New password must be at least 8 characters.", intent };
    }

    if (newPassword !== confirmPassword) {
      return { error: "New passwords don't match.", intent };
    }

    // Verify current password
    const user = await getAdminUserByEmail(sessionUser.email);
    if (!user) {
      return { error: "User not found.", intent };
    }

    const isValid = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      return { error: "Current password is incorrect.", intent };
    }

    await updateAdminPassword(sessionUser.id, newPassword);
    return redirect("/admin/account?toast=Password+changed+successfully");
  }

  return redirect("/admin/account");
}

export default function AdminAccount() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [name, setName] = useState((user as any).name || "");
  const [email, setEmail] = useState((user as any).email || "");

  const ic =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary";

  return (
    <div className="px-6 py-8">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">
          Admin
        </Link>
        <span>/</span>
        <span>My Account</span>
      </div>

      <h1 className="text-3xl font-bold text-dark mb-8">My Account</h1>

      <div className="max-w-xl space-y-8">
        {/* Profile Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-dark mb-1">
            Profile
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Update your name and email address.
          </p>

          {actionData?.intent === "update-profile" && actionData?.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {actionData.error}
            </div>
          )}

          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="update-profile" />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className={ic}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={ic}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-primary text-white font-medium text-sm rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Profile"}
            </button>
          </Form>
        </div>

        {/* Change Password Section */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-dark mb-1">
            Change Password
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Enter your current password and choose a new one.
          </p>

          {actionData?.intent === "change-password" && actionData?.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {actionData.error}
            </div>
          )}

          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="change-password" />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                name="current_password"
                required
                autoComplete="current-password"
                className={ic}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                name="new_password"
                required
                minLength={8}
                autoComplete="new-password"
                className={ic}
              />
              <p className="text-xs text-gray-400 mt-1">
                Minimum 8 characters.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                name="confirm_password"
                required
                minLength={8}
                autoComplete="new-password"
                className={ic}
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 bg-dark text-white font-medium text-sm rounded-lg hover:bg-dark/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Updating..." : "Change Password"}
            </button>
          </Form>
        </div>

        {/* Account Info */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Account Info
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24">User ID</dt>
              <dd className="text-gray-700 font-mono text-xs">
                {(user as any).id}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-24">Created</dt>
              <dd className="text-gray-700">
                {formatLongDate((user as any).created_at)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
