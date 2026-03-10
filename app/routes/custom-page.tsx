import { redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/custom-page";
import { getPublishedCustomPage } from "../lib/pages.server";
import { getBlogPostBySlug, getSettings } from "../lib/queries.server";
import { applyTitleTemplate } from "../lib/title-template";
import { getNewsArticlePath } from "../lib/news-url";
import { siteConfig } from "../lib/site-config";

export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params["*"];
  if (!slug) {
    throw new Response("Not Found", { status: 404 });
  }

  // Legacy root-level news article URLs now canonicalize to /news/{slug}.
  if (!slug.includes("/")) {
    const post = (await getBlogPostBySlug(slug)) as any;
    if (post && post.status === "published") {
      const url = new URL(request.url);
      throw redirect(`${getNewsArticlePath(post.slug)}${url.search}`, 301);
    }
  }

  const page = await getPublishedCustomPage(slug);
  if (!page) {
    throw new Response("Not Found", { status: 404 });
  }

  const settings = await getSettings();

  return { page, settings };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data?.page) return [{ title: "Page Not Found" }];

  const page = data.page as any;
  const settings = data.settings as Record<string, string>;
  const titleTemplate = settings?.title_template || "{title} | {site_name}";

  const displayTitle = page.meta_title || page.title;
  const renderedTitle = applyTitleTemplate(displayTitle, titleTemplate);

  const tags: any[] = [
    { title: renderedTitle },
  ];

  if (page.meta_description) {
    tags.push({ name: "description", content: page.meta_description });
  }

  // Open Graph
  tags.push({ property: "og:title", content: renderedTitle });
  tags.push({ property: "og:type", content: "website" });
  tags.push({ property: "og:url", content: `${siteConfig.siteUrl}/${page.slug}` });

  if (page.meta_description) {
    tags.push({ property: "og:description", content: page.meta_description });
  }
  if (page.og_image) {
    tags.push({ property: "og:image", content: page.og_image });
  }

  // Canonical
  tags.push({
    tagName: "link",
    rel: "canonical",
    href: `${siteConfig.siteUrl}/${page.slug}`,
  });

  return tags;
}

export default function CustomPage() {
  const { page } = useLoaderData<typeof loader>();
  const p = page as any;

  return (
    <div className="max-w-[800px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-dark mb-8">{p.title}</h1>
      {p.body && (
        <div
          className="prose prose-lg max-w-none prose-headings:text-dark prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
          dangerouslySetInnerHTML={{ __html: p.body }}
        />
      )}
    </div>
  );
}
