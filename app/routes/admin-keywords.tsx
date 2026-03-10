import { Link, useLoaderData, Form, redirect } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/admin-keywords";
import { requireAuth } from "../lib/auth.server";
import {
  getRagDocuments,
  createRagDocument,
  updateRagDocument,
  deleteRagDocument,
} from "../lib/queries.server";
import { siteConfig } from "../lib/site-config";

export function meta() {
  return [{ title: `SEO Keywords | Admin | ${siteConfig.siteName}` }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuth(request);
  const documents = await getRagDocuments();
  return { documents };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAuth(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "create") {
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    if (!title || !content) {
      return { error: "Title and content are required." };
    }
    await createRagDocument({ title, content });
    return redirect("/admin/keywords?toast=Document+created");
  }

  if (intent === "update") {
    const id = formData.get("id") as string;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    if (!id) return { error: "Document ID is required." };
    await updateRagDocument(id, { title, content });
    return redirect("/admin/keywords?toast=Document+updated");
  }

  if (intent === "delete") {
    const id = formData.get("id") as string;
    if (!id) return { error: "Document ID is required." };
    await deleteRagDocument(id);
    return redirect("/admin/keywords?toast=Document+deleted");
  }

  if (intent === "toggle-active") {
    const id = formData.get("id") as string;
    const currentActive = formData.get("is_active") === "true";
    if (!id) return { error: "Document ID is required." };
    await updateRagDocument(id, { is_active: !currentActive });
    return redirect("/admin/keywords?toast=Status+updated");
  }

  return { error: "Unknown action." };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function AdminKeywords() {
  const { documents } = useLoaderData<typeof loader>();
  const docs = documents as any[];
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const startCreate = () => {
    setEditingDoc(null);
    setTitle("");
    setContent("");
    setShowForm(true);
  };

  const startEdit = (doc: any) => {
    setEditingDoc(doc);
    setTitle(doc.title);
    setContent(doc.content);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingDoc(null);
    setTitle("");
    setContent("");
  };

  return (
    <div className="px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
        <Link to="/admin/dashboard" className="hover:text-primary">Admin</Link>
        <span>/</span>
        <span>SEO Keywords</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-dark">SEO Keywords</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage keyword reference documents used by AI content generation.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Document
          </button>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-8">
          <h2 className="text-lg font-semibold text-dark mb-5">
            {editingDoc ? "Edit Document" : "Create New Document"}
          </h2>
          <Form method="post" className="space-y-5">
            <input type="hidden" name="intent" value={editingDoc ? "update" : "create"} />
            {editingDoc && <input type="hidden" name="id" value={editingDoc.id} />}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                type="text"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary"
                placeholder={`e.g. Master Keyword List — ${siteConfig.siteName}`}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                name="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={20}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary font-mono text-sm leading-relaxed"
                placeholder="Paste your keyword list, groupings, or SEO reference document here..."
              />
              <p className="text-xs text-gray-400 mt-1">
                <span className="font-medium text-gray-500">{countWords(content)} words</span>
                {" "}&mdash; This content will be provided to Claude AI as context when generating listing descriptions.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                className="px-5 py-2 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                {editingDoc ? "Update Document" : "Create Document"}
              </button>
              <button
                type="button"
                onClick={cancelForm}
                className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </Form>
        </div>
      )}

      {/* Document List */}
      {docs.length === 0 && !showForm ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-700 mb-1">No keyword documents yet</h3>
          <p className="text-sm text-gray-500 mb-6">
            Upload your master keyword list to power AI content generation.
          </p>
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Your First Document
          </button>
        </div>
      ) : docs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Words</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Updated</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((doc: any) => (
                <tr key={doc.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-dark">{doc.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Form method="post" className="inline">
                      <input type="hidden" name="intent" value="toggle-active" />
                      <input type="hidden" name="id" value={doc.id} />
                      <input type="hidden" name="is_active" value={String(doc.is_active)} />
                      <button
                        type="submit"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                          doc.is_active
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${doc.is_active ? "bg-emerald-500" : "bg-gray-400"}`} />
                        {doc.is_active ? "Active" : "Inactive"}
                      </button>
                    </Form>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {countWords(doc.content || "").toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(doc.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(doc)}
                        className="text-sm text-primary hover:text-primary/70 font-medium"
                      >
                        Edit
                      </button>
                      <Form
                        method="post"
                        onSubmit={(e) => {
                          if (!confirm("Delete this document? This cannot be undone.")) {
                            e.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={doc.id} />
                        <button
                          type="submit"
                          className="text-sm text-gray-400 hover:text-red-600 font-medium"
                        >
                          Delete
                        </button>
                      </Form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info box */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">How keyword documents work</h3>
        <ul className="text-sm text-blue-700 space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Active documents are automatically provided to Claude AI as context when generating listing descriptions via Auto Populate.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Claude will naturally incorporate relevant keywords into descriptions, taglines, and other generated content.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>You can create multiple documents (e.g., one per content category) and toggle them active/inactive as needed.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">•</span>
            <span>Make sure your Anthropic API key is configured in Settings → Tracking for AI generation to work.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
