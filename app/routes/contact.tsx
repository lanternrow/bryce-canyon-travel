import { Form, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/contact";
import { formatPageTitle, getSiteName } from "../lib/title-template";
import { addSubscriber } from "../lib/mailchimp.server";
import { getSystemPage } from "../lib/pages.server";
import { siteConfig } from "../lib/site-config";

export function meta({ data, matches }: Route.MetaArgs) {
  const seo = (data as any)?.seo || {};
  const seoTitle = seo.meta_title || "Contact Us";
  const seoDescription =
    seo.meta_description || DEFAULT_CONTACT_SEO.meta_description;
  const ogImage = seo.og_image || "";
  const siteName = getSiteName(matches);

  const tags: Array<Record<string, string>> = [
    { title: formatPageTitle(seoTitle, matches) },
    { name: "description", content: seoDescription },
    { tagName: "link", rel: "canonical", href: `${siteConfig.siteUrl}/contact` },

    // Open Graph
    { property: "og:title", content: seoTitle },
    { property: "og:description", content: seoDescription },
    { property: "og:url", content: `${siteConfig.siteUrl}/contact` },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: siteName },

    // Twitter Card
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: seoTitle },
    { name: "twitter:description", content: seoDescription },
  ];

  if (ogImage) {
    tags.push({ property: "og:image", content: ogImage });
    tags.push({ name: "twitter:image", content: ogImage });
  }

  return tags;
}

const DEFAULT_CONTACT_PAGE = {
  hero: {
    title: "CONTACT US",
    subtitle: siteConfig.defaults.contactSubtitle,
    bg_image: "",
    bg_image_focal_x: 50,
    bg_image_focal_y: 50,
    gradient_from: "#111827",
    gradient_via: "#1f2937",
    gradient_to: "#111827",
    gradient_opacity: 100,
    gradient_direction: "to-br",
    height: 300,
    title_size_mobile: 48,
    title_size_desktop: 64,
    title_color: "#ffffff",
    subtitle_color: "#d1d5db",
  },
};

const DEFAULT_CONTACT_SEO = {
  meta_title: siteConfig.defaults.contactSeoTitle,
  meta_description: siteConfig.defaults.contactSeoDescription,
  og_image: "",
};

function mergeContactContent(pageContent: any) {
  if (!pageContent) return DEFAULT_CONTACT_PAGE;
  return {
    ...DEFAULT_CONTACT_PAGE,
    ...pageContent,
    hero: {
      ...DEFAULT_CONTACT_PAGE.hero,
      ...(pageContent.hero || {}),
    },
  };
}

function normalizeFocal(value: unknown, fallback = 50) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function getObjectPosition(x: unknown, y: unknown) {
  return `${normalizeFocal(x)}% ${normalizeFocal(y)}%`;
}

function getGradientBackground(hero: {
  gradient_from?: string;
  gradient_via?: string;
  gradient_to?: string;
  gradient_direction?: string;
}) {
  const from = hero.gradient_from || "#111827";
  const via = hero.gradient_via || "#1f2937";
  const to = hero.gradient_to || "#111827";
  const direction = hero.gradient_direction || "to-br";
  const directionCss: Record<string, string> = {
    "to-br": "to bottom right",
    "to-b": "to bottom",
    "to-r": "to right",
    "to-bl": "to bottom left",
  };

  if (direction === "radial") {
    return `radial-gradient(circle, ${from}, ${via}, ${to})`;
  }
  return `linear-gradient(${directionCss[direction] || "to bottom right"}, ${from}, ${via}, ${to})`;
}

export async function loader({}: Route.LoaderArgs) {
  const page = await getSystemPage("contact");
  return {
    content: mergeContactContent(page?.content),
    seo: {
      meta_title: page?.meta_title || DEFAULT_CONTACT_SEO.meta_title,
      meta_description: page?.meta_description || DEFAULT_CONTACT_SEO.meta_description,
      og_image: page?.og_image || DEFAULT_CONTACT_SEO.og_image,
    },
  };
}

/**
 * POST /contact — handle form submission, optionally subscribe to newsletter.
 */
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = (formData.get("name") as string)?.trim() || "";
  const email = (formData.get("email") as string)?.trim() || "";
  const subject = (formData.get("subject") as string) || "";
  const message = (formData.get("message") as string)?.trim() || "";

  // Basic validation
  if (!name || !email || !message) {
    return { success: false, message: "Please fill in all required fields." };
  }
  if (!email.includes("@")) {
    return { success: false, message: "Please enter a valid email address." };
  }

  // Subscribe email to Mailchimp with "contact-form" tag
  const [firstName, ...rest] = name.split(" ");
  const lastName = rest.join(" ");
  await addSubscriber(email, {
    firstName,
    lastName: lastName || undefined,
    tags: ["contact-form"],
  });

  // TODO: send actual email notification (e.g., via SendGrid, Resend, etc.)
  // For now we just acknowledge receipt + subscribe.

  return {
    success: true,
    message:
      "Thanks for reaching out! We'll get back to you soon." +
      " We've also added you to our newsletter — check your email to confirm.",
  };
}

export default function ContactPage() {
  const { content } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const pageContent = content as typeof DEFAULT_CONTACT_PAGE;
  const hero = pageContent.hero;
  return (
    <div>
      {/* Hero */}
      <div
        className="relative flex items-center justify-center"
        style={{
          height: `${Math.min(520, Math.max(220, Number(hero.height) || 300))}px`,
        }}
      >
        {hero.bg_image && (
          <img
            src={hero.bg_image}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              objectPosition: getObjectPosition(
                hero.bg_image_focal_x,
                hero.bg_image_focal_y
              ),
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: getGradientBackground(hero),
            opacity:
              Math.min(100, Math.max(0, Number(hero.gradient_opacity) || 100)) /
              100,
          }}
        />
        <div className="text-center">
          <h1
            className="font-black tracking-wide px-4"
            style={{
              color: hero.title_color || "#ffffff",
              fontSize: `clamp(${Math.min(72, Math.max(24, Number(hero.title_size_mobile) || 48))}px, 6vw, ${Math.min(92, Math.max(28, Number(hero.title_size_desktop) || 64))}px)`,
            }}
          >
            {hero.title}
          </h1>
          <p
            className="mt-4 text-lg max-w-2xl mx-auto px-4"
            style={{ color: hero.subtitle_color || "#d1d5db" }}
          >
            {hero.subtitle}
          </p>
        </div>
      </div>

      <div className="max-w-[1250px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-dark mb-6">
              Send Us a Message
            </h2>
            {actionData?.success && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
                {actionData.message}
              </div>
            )}
            {actionData && !actionData.success && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {actionData.message}
              </div>
            )}
            <Form method="post" className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label
                    htmlFor="name"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Your Name <span className="text-primary">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Email Address <span className="text-primary">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors"
                    placeholder="john@example.com"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="subject"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Subject
                </label>
                <select
                  id="subject"
                  name="subject"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors bg-white"
                >
                  <option value="">Select a topic...</option>
                  <option value="general">General Inquiry</option>
                  <option value="listing">Submit a Business Listing</option>
                  <option value="advertising">Advertising Opportunities</option>
                  <option value="correction">Correction or Update</option>
                  <option value="feedback">Feedback</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="message"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Message <span className="text-primary">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={6}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors resize-vertical"
                  placeholder="How can we help you?"
                />
              </div>

              <button
                type="submit"
                className="px-8 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 transition-colors"
              >
                Send Message
              </button>
            </Form>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-8">
            {/* Contact Info */}
            <div className="bg-cream/50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-dark mb-4">
                Contact Information
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-primary mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Email</p>
                    <a
                      href={`mailto:${siteConfig.contactEmail}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {siteConfig.contactEmail}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-primary mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-700">
                      Serving the Area
                    </p>
                    <p className="text-sm text-gray-600">
                      {siteConfig.defaults.contactAreaLabel}
                      <br />
                      {siteConfig.defaults.contactAreaDetail}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* List Your Business */}
            <div className="bg-sage/10 border border-sage/30 rounded-xl p-6">
              <h3 className="text-lg font-bold text-dark mb-2">
                List Your Business
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {siteConfig.defaults.contactListBizDescription}
              </p>
              <a
                href={`mailto:${siteConfig.contactEmail}?subject=Business%20Listing%20Inquiry`}
                className="inline-block px-5 py-2 bg-sage text-white text-sm font-medium rounded-lg hover:bg-sage/90 transition-colors"
              >
                Get Started
              </a>
            </div>

            {/* Quick Links */}
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="text-lg font-bold text-dark mb-4">
                Helpful Links
              </h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href={siteConfig.npsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    NPS Official {siteConfig.parkName.split(" ")[0]} Page
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.recreation.gov/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    Recreation.gov (Permits)
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </li>
                <li>
                  <a
                    href="/news"
                    className="text-sm text-primary hover:underline"
                  >
                    {siteConfig.siteName} News Articles
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
