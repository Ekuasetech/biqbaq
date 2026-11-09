"use client";

import Image from "@tiptap/extension-image";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { safeHref, type Doc } from "@/modules/blog/rich-text";
import { MediaError, uploadBlogImage } from "@/modules/media-management/client";

function ToolButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn("inline-flex size-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40", active && "bg-brand-navy text-white hover:bg-brand-navy")}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, postId, photos, onError }: { editor: Editor; postId: string | null; photos: boolean; onError: (code: string) => void }) {
  const t = useTranslations("blogAdmin.editor");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");
  const [photo, setPhoto] = useState<{ alt: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();

  function applyLink() {
    const safe = safeHref(href) ?? safeHref(`https://${href}`);
    if (!safe) {
      onError("linkInvalid");
      return;
    }
    chain().extendMarkRange("link").setLink({ href: safe }).run();
    setLinking(false);
    setHref("");
  }

  async function upload(file: File) {
    if (!postId || !photo) return;
    setUploading(true);
    try {
      const url = await uploadBlogImage(postId, file);
      chain().setImage({ src: url, alt: photo.alt.trim() }).run();
      setPhoto(null);
    } catch (error) {
      onError(error instanceof MediaError ? `photo.${error.code}` : "generic");
    }
    setUploading(false);
  }

  return (
    <div className="grid gap-2 border-b border-border bg-muted/40 p-1.5">
      <div role="toolbar" aria-label={t("toolbar")} className="flex flex-wrap items-center gap-0.5">
        <ToolButton label={t("paragraph")} onClick={() => chain().setParagraph().run()}><Pilcrow className="size-4" /></ToolButton>
        <ToolButton label={t("heading2")} active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></ToolButton>
        <ToolButton label={t("heading3")} active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className="size-4" /></ToolButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label={t("bold")} active={state.bold} onClick={() => chain().toggleBold().run()}><Bold className="size-4" /></ToolButton>
        <ToolButton label={t("italic")} active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic className="size-4" /></ToolButton>
        <ToolButton label={t("underline")} active={state.underline} onClick={() => chain().toggleUnderline().run()}><Underline className="size-4" /></ToolButton>
        <ToolButton label={t("strike")} active={state.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough className="size-4" /></ToolButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label={t("bulletList")} active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List className="size-4" /></ToolButton>
        <ToolButton label={t("orderedList")} active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolButton>
        <ToolButton label={t("quote")} active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote className="size-4" /></ToolButton>
        <ToolButton label={t("divider")} onClick={() => chain().setHorizontalRule().run()}><Minus className="size-4" /></ToolButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label={t("link")} active={state.link} onClick={() => { setHref(editor.getAttributes("link").href ?? ""); setLinking(true); setPhoto(null); }}><LinkIcon className="size-4" /></ToolButton>
        <ToolButton label={t("unlink")} disabled={!state.link} onClick={() => chain().extendMarkRange("link").unsetLink().run()}><Unlink className="size-4" /></ToolButton>
        {photos && <ToolButton label={t("photo")} disabled={!postId} onClick={() => { setPhoto({ alt: "" }); setLinking(false); }}><ImagePlus className="size-4" /></ToolButton>}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <ToolButton label={t("undo")} disabled={!state.canUndo} onClick={() => chain().undo().run()}><Undo2 className="size-4" /></ToolButton>
        <ToolButton label={t("redo")} disabled={!state.canRedo} onClick={() => chain().redo().run()}><Redo2 className="size-4" /></ToolButton>
      </div>
      {photos && !postId && <p className="px-1 text-xs text-muted-foreground">{t("saveBeforePhotos")}</p>}
      {linking && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <label htmlFor="editor-link" className="text-sm font-medium">{t("linkAddress")}</label>
          <Input id="editor-link" value={href} placeholder="https://" onChange={(event) => setHref(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyLink(); } }} className="h-9 max-w-xs" />
          <button type="button" onClick={applyLink} className="h-9 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white">{t("applyLink")}</button>
          <button type="button" onClick={() => setLinking(false)} className="h-9 rounded-lg border border-border px-3 text-sm font-semibold">{t("cancel")}</button>
        </div>
      )}
      {photo && (
        <div className="flex flex-wrap items-center gap-2 px-1">
          <label htmlFor="editor-photo-alt" className="text-sm font-medium">{t("photoDescription")}</label>
          <Input id="editor-photo-alt" value={photo.alt} maxLength={300} onChange={(event) => setPhoto({ alt: event.target.value })} className="h-9 max-w-xs" />
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t("choosePhoto")} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }} />
          <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className="h-9 rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white disabled:opacity-60">{uploading ? t("uploading") : t("choosePhoto")}</button>
          <button type="button" onClick={() => setPhoto(null)} className="h-9 rounded-lg border border-border px-3 text-sm font-semibold">{t("cancel")}</button>
          <p className="w-full text-xs text-muted-foreground">{t("photoHint")}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Tiptap, limited to the formatting the owner chose (2026-11-07). Code, tables and other
 * extras are off, and links to anything but web and email addresses cannot be made.
 */
export function RichTextEditor({ id, label, initial, postId, disabled, photos = true, onChange, onError }: {
  id: string;
  label: string;
  initial: Doc;
  postId: string | null;
  disabled?: boolean;
  /** False where the page has its own photo, such as About us: no photos inside the text. */
  photos?: boolean;
  onChange: (doc: Doc) => void;
  onError: (code: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          protocols: ["http", "https", "mailto"],
          isAllowedUri: (url) => safeHref(url) !== null,
          HTMLAttributes: { rel: "noopener noreferrer", target: null },
        },
      }),
      Image.configure({ allowBase64: false }),
    ],
    content: initial,
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class: "rich-text min-h-72 px-4 py-3 outline-none [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-bold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:mt-3 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-red [&_blockquote]:pl-4 [&_blockquote]:italic [&_a]:text-brand-red [&_a]:underline [&_img]:mt-4 [&_img]:rounded-xl [&_hr]:my-6",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as Doc),
  });

  return (
    <div className={cn("overflow-hidden rounded-lg border border-input bg-card focus-within:ring-2 focus-within:ring-ring", disabled && "opacity-60")}>
      {editor && !disabled && <Toolbar editor={editor} postId={postId} photos={photos} onError={onError} />}
      <EditorContent editor={editor} />
    </div>
  );
}
