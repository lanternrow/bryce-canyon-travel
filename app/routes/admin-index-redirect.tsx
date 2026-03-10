import { redirect } from "react-router";
import type { Route } from "./+types/admin-index-redirect";

// Redirect /admin to /admin/dashboard.
// This exists because React Router v7 has a known issue where <Link to="/admin">
// from child routes (e.g. /admin/posts) doesn't navigate to the index route.
// Using an explicit /admin/dashboard path avoids the bug entirely.
export function loader({}: Route.LoaderArgs) {
  return redirect("/admin/dashboard");
}
