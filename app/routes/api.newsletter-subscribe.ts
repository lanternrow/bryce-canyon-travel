import { addSubscriber } from "../lib/mailchimp.server";

/**
 * POST /api/newsletter-subscribe
 * Body: { email: string }
 * Returns: { success, status, message }
 */
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@")) {
    return Response.json(
      { success: false, status: "error", message: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const result = await addSubscriber(email);
  return Response.json(result);
}
