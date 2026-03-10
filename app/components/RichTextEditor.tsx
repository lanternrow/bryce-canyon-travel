import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { useCallback, useEffect, useRef, useState } from "react";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Increment to force-sync external content changes into the editor (e.g. after AI rewrite) */
  contentVersion?: number;
}

interface LinkSearchResult {
  title: string;
  url: string;
  type: string | null;
  contentType: "listing" | "post" | "page";
}

function ToolbarButton({
  onClick,
  isActive,
  children,
  title,
}: {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded text-sm transition-colors ${
        isActive
          ? "bg-dark text-white"
          : "text-gray-600 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

const CONTENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  listing: { label: "Listing", color: "bg-blue-100 text-blue-700" },
  post: { label: "Article", color: "bg-purple-100 text-purple-700" },
  page: { label: "Page", color: "bg-emerald-100 text-emerald-700" },
};

function LinkPopup({
  initialUrl,
  onSubmit,
  onRemove,
  onClose,
  position,
}: {
  initialUrl: string;
  onSubmit: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
  position: { top: number; left: number };
}) {
  const [url, setUrl] = useState(initialUrl);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LinkSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Search internal content
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/link-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results || []);
        setActiveIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, []);

  const handleInputChange = (value: string) => {
    setUrl(value);
    // If it doesn't look like a URL, treat as search query
    if (!value.startsWith("http") && !value.startsWith("/") && !value.startsWith("#")) {
      setQuery(value);
      search(value);
    } else {
      setQuery("");
      setResults([]);
    }
  };

  const handleSelect = (resultUrl: string) => {
    onSubmit(resultUrl);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && results[activeIndex]) {
          handleSelect(results[activeIndex].url);
        } else if (url) {
          onSubmit(url);
        }
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (url) onSubmit(url);
    }
  };

  // Clamp popup position to viewport
  const popupStyle: React.CSSProperties = {
    position: "absolute",
    top: position.top,
    left: Math.max(8, Math.min(position.left - 180, window.innerWidth - 400)),
    zIndex: 50,
  };

  return (
    <div ref={popupRef} style={popupStyle} className="w-[380px] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
      {/* Input */}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={url}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste URL or search pages..."
            className="flex-1 text-sm border-none outline-none bg-transparent placeholder-gray-400"
          />
          {initialUrl && (
            <button
              type="button"
              onClick={onRemove}
              className="text-xs text-red-500 hover:text-red-700 font-medium whitespace-nowrap"
              title="Remove link"
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={() => url && onSubmit(url)}
            disabled={!url}
            className="px-2.5 py-1 text-xs font-medium bg-dark text-white rounded hover:bg-dark/90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Search results */}
      {(results.length > 0 || loading) && (
        <div className="border-t border-gray-100 max-h-[240px] overflow-y-auto">
          {loading && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">Searching...</div>
          )}
          {results.map((r, i) => {
            const badge = CONTENT_TYPE_LABELS[r.contentType] || { label: r.contentType, color: "bg-gray-100 text-gray-600" };
            return (
              <button
                key={`${r.url}-${i}`}
                type="button"
                onClick={() => handleSelect(r.url)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                  i === activeIndex ? "bg-gray-50" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{r.title}</div>
                  <div className="text-xs text-gray-400 truncate">{r.url}</div>
                </div>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize flex-shrink-0 ${badge.color}`}>
                  {r.type || badge.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Hint */}
      {!loading && results.length === 0 && !url.startsWith("http") && !url.startsWith("/") && query.length >= 2 && (
        <div className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-400 text-center">
          No matching pages found
        </div>
      )}
    </div>
  );
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = "Start writing your news article...",
  contentVersion = 0,
}: RichTextEditorProps) {
  const [linkPopup, setLinkPopup] = useState<{ top: number; left: number } | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-primary underline" },
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-lg max-w-full" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-[400px] px-4 py-3 focus:outline-none [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_blockquote]:border-l-4 [&_blockquote]:border-sand [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 [&_blockquote]:my-4 [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:my-4 [&_img]:rounded-lg [&_img]:my-4 [&_a]:text-primary [&_a]:underline",
      },
    },
  });

  // Keep content in sync if it changes externally (e.g. initial load or AI rewrite)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentVersion]);

  const openLinkPopup = useCallback(() => {
    if (!editor) return;

    // Get cursor/selection position relative to the editor wrapper
    const { view } = editor;
    const { from } = view.state.selection;
    const coords = view.coordsAtPos(from);
    const wrapperRect = editorWrapperRef.current?.getBoundingClientRect();

    if (wrapperRect) {
      setLinkPopup({
        top: coords.bottom - wrapperRect.top + 8,
        left: coords.left - wrapperRect.left,
      });
    } else {
      setLinkPopup({ top: coords.bottom + 8, left: coords.left });
    }
  }, [editor]);

  const handleLinkSubmit = useCallback(
    (url: string) => {
      if (!editor) return;
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
      setLinkPopup(null);
    },
    [editor]
  );

  const handleLinkRemove = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkPopup(null);
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("Image URL");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  const currentLinkUrl = editor.isActive("link") ? editor.getAttributes("link").href || "" : "";

  return (
    <div ref={editorWrapperRef} className="border border-gray-300 rounded-lg bg-white max-h-[70vh] overflow-y-auto relative">
      {/* Toolbar — sticky at top of scrollable editor */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive("heading", { level: 2 })}
          title="Heading 2"
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive("heading", { level: 3 })}
          title="Heading 3"
        >
          H3
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="Bullet List"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="Numbered List"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 6h13M7 12h13M7 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive("blockquote")}
          title="Blockquote"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive("codeBlock")}
          title="Code Block"
        >
          {"</>"}
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton onClick={openLinkPopup} isActive={editor.isActive("link")} title="Link">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={addImage} title="Image">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Horizontal Rule"
        >
          —
        </ToolbarButton>

        <div className="flex-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v3M3 10l6-6M3 10l6 6" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v3m16-8l-6-6m6 6l-6 6" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Editor Content */}
      <EditorContent editor={editor} />

      {/* Inline link popup */}
      {linkPopup && (
        <LinkPopup
          initialUrl={currentLinkUrl}
          onSubmit={handleLinkSubmit}
          onRemove={handleLinkRemove}
          onClose={() => setLinkPopup(null)}
          position={linkPopup}
        />
      )}
    </div>
  );
}
