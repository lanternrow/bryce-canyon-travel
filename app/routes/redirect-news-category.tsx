import { redirect } from "react-router";
import type { Route } from "./+types/redirect-news-category";
import { getNewsCategoryPath } from "../lib/news-url";

export function loader({ params, request }: Route.LoaderArgs) {
  const categorySlug = params.categorySlug;
  if (!categorySlug) {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  throw redirect(`${getNewsCategoryPath(categorySlug)}${url.search}`, 301);
}

export default function RedirectNewsCategory() {
  return null;
}
