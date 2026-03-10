import { Link, useLoaderData, Form, redirect } from "react-router";
import type { Route } from "./+types/admin-pages-list";
import { requireAuth } from "../lib/auth.server";
import { getCustomPages, deleteCustomPage, getSystemPage } from "../lib/pages.server";
import { formatShortDate } from "../lib/format";
import { getDirectoryPageDefinitions } from "../lib/directory-pages";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `Pages | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const [pages, definitions] = await Promise.all([
    getCustomPages(),
    Promise.resolve(getDirectoryPageDefinitions()),
  ]);

  const directoryPages = await Promise.all(
    definitions.map(async (definition) => {
      const page = await getSystemPage(definition.slug);
      return {
        ...definition,
        updated_at: page?.updated_at || null,
      };
    })
  );

  return { pages, directoryPages };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const slug = formData.get("slug") as string;
    if (slug) {
      await deleteCustomPage(slug);
    }
    return redirect("/admin/pages?toast=Page+deleted");
  }

  return null;
}

const statusBadge: Record<string, { classes: string; label: string }> = {
  published: { classes: "bg-emerald-100 text-emerald-700", label: "Published" },
  draft: { classes: "bg-gray-100 text-gray-600", label: "Draft" },
};

export default function AdminPagesList() {
  const { pages, directoryPages } = useLoaderData<typeof loader>();

  return (
    <div className="px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">
          Admin
        </Link>
        <span>/</span>
        <span>Pages</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-dark">Pages</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/admin/pages/homepage"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Edit Homepage
          </Link>
          <Link
            to="/admin/pages/news"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 6.75v10.5a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25V6.75m15 0A2.25 2.25 0 0017.25 4.5H6.75A2.25 2.25 0 004.5 6.75m15 0l-7.28 4.368a.75.75 0 01-.77 0L4.5 6.75" />
            </svg>
            Edit News Page
          </Link>
          <Link
            to="/admin/pages/contact"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 12l8.954-8.955a1.5 1.5 0 012.121 0L22.279 12M4.5 9.75v10.125c0 .414.336.75.75.75H9v-5.25A2.25 2.25 0 0111.25 13h1.5A2.25 2.25 0 0115 15.25v5.25h3.75a.75.75 0 00.75-.75V9.75" />
            </svg>
            Edit Contact Page
          </Link>
          <Link
            to="/admin/pages/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Page
          </Link>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold text-dark mb-1">
          Directory Core Pages
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Edit hero content, focus keyphrase, and SEO for each directory page.
          New directory pages added in code are listed here automatically.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {directoryPages.map((page) => (
            <div
              key={page.slug}
              className="border border-gray-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-dark truncate">
                  {page.title}
                </p>
                <p className="text-xs text-gray-500 font-mono">{page.path}</p>
                {page.updated_at ? (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Updated {formatShortDate(page.updated_at)}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Using defaults
                  </p>
                )}
              </div>
              <Link
                to={`/admin/pages/directory/${page.slug}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shrink-0"
              >
                Edit
              </Link>
            </div>
          ))}
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No custom pages yet</h3>
          <p className="text-sm text-gray-500 mb-4">Create pages like About Us, Contact, Terms, etc.</p>
          <Link
            to="/admin/pages/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            Create Your First Page
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(pages as any[]).map((page) => {
                const badge = statusBadge[page.status] || statusBadge.draft;
                return (
                  <tr key={page.slug} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/pages/${page.slug}/edit`}
                        className="text-sm font-medium text-gray-900 hover:text-primary transition-colors"
                      >
                        {page.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-500 font-mono">/{page.slug}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.classes}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatShortDate(page.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {page.status === "published" && (
                          <a
                            href={`/${page.slug}`}
                            target="_blank"
                            rel="noopener"
                            className="text-xs text-gray-400 hover:text-primary transition-colors"
                            title="View page"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                        <Link
                          to={`/admin/pages/${page.slug}/edit`}
                          className="text-xs text-gray-400 hover:text-primary transition-colors"
                          title="Edit page"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Link>
                        <Form method="post" className="inline">
                          <input type="hidden" name="intent" value="delete" />
                          <input type="hidden" name="slug" value={page.slug} />
                          <button
                            type="submit"
                            onClick={(e) => {
                              if (!confirm(`Delete "${page.title}"? This cannot be undone.`)) {
                                e.preventDefault();
                              }
                            }}
                            className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                            title="Delete page"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
