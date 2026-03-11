import type { Route } from "./+types/api.debug-last-error";
import { requireAuth } from "../lib/auth.server";
import { getLastError } from "../entry.server";

export async function loader({ request }: Route.LoaderArgs) {
  try {
    await requireAuth(request);
  } catch (e) {
    return Response.json({ error: "Auth required" }, { status: 401 });
  }

  const lastError = getLastError();
  return Response.json({ lastError });
}
