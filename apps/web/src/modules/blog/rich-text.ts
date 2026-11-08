// The shape of a blog article, shared by the editor, the server and the page. It is the only
// formatting the site will ever draw: anything else in a document is dropped.

export type Mark =
  | { type: "bold" | "italic" | "underline" | "strike" }
  | { type: "link"; attrs: { href: string } };

export type Node =
  | { type: "text"; text: string; marks?: Mark[] }
  | { type: "hardBreak" | "horizontalRule" }
  | { type: "paragraph" | "blockquote" | "bulletList" | "listItem"; content?: Node[] }
  | { type: "orderedList"; attrs?: { start: number }; content?: Node[] }
  | { type: "heading"; attrs: { level: 2 | 3 }; content?: Node[] }
  | { type: "image"; attrs: { src: string; alt: string } };

export interface Doc {
  type: "doc";
  content: Node[];
}

const MAX_NODES = 5000;
const MAX_DEPTH = 12;
const MAX_TEXT = 50000;

/** Ordinary web and email links only. Nothing that runs code, and nothing on this site's own scheme tricks. */
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  const href = value.trim();
  try {
    const url = new URL(href);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    if (url.protocol === "mailto:" && /^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return href;
  } catch {}
  return null;
}

class Invalid extends Error {}

/**
 * Rebuilds a document from scratch, keeping only what Biqbaq draws. It never passes an object
 * through, so unexpected attributes cannot survive. Throws on anything too big or malformed.
 */
export function cleanDoc(input: unknown): Doc {
  let count = 0;
  let textLength = 0;
  const children = (value: unknown, depth: number): Node[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || depth > MAX_DEPTH) throw new Invalid();
    return value.flatMap((child) => node(child, depth));
  };
  const node = (value: unknown, depth: number): Node[] => {
    if (++count > MAX_NODES || typeof value !== "object" || value === null) throw new Invalid();
    const raw = value as { type?: unknown; text?: unknown; marks?: unknown; attrs?: Record<string, unknown>; content?: unknown };
    switch (raw.type) {
      case "text": {
        if (typeof raw.text !== "string" || raw.text === "") return [];
        textLength += raw.text.length;
        if (textLength > MAX_TEXT) throw new Invalid();
        const marks: Mark[] = [];
        for (const mark of Array.isArray(raw.marks) ? raw.marks : []) {
          const type = (mark as { type?: unknown })?.type;
          if (type === "bold" || type === "italic" || type === "underline" || type === "strike") marks.push({ type });
          if (type === "link") {
            const href = safeHref((mark as { attrs?: { href?: unknown } }).attrs?.href);
            if (href) marks.push({ type: "link", attrs: { href } });
          }
        }
        return [marks.length ? { type: "text", text: raw.text, marks } : { type: "text", text: raw.text }];
      }
      case "hardBreak":
      case "horizontalRule":
        return [{ type: raw.type }];
      case "paragraph":
      case "blockquote":
      case "bulletList":
      case "listItem":
        return [{ type: raw.type, content: children(raw.content, depth + 1) }];
      case "orderedList": {
        const start = Number(raw.attrs?.start ?? 1);
        return [{ type: "orderedList", attrs: { start: Number.isInteger(start) && start > 0 && start < 10000 ? start : 1 }, content: children(raw.content, depth + 1) }];
      }
      case "heading":
        return [{ type: "heading", attrs: { level: raw.attrs?.level === 3 ? 3 : 2 }, content: children(raw.content, depth + 1) }];
      case "image": {
        const src = raw.attrs?.src;
        if (typeof src !== "string" || !/^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/.test(src)) throw new Invalid();
        const alt = typeof raw.attrs?.alt === "string" ? raw.attrs.alt.slice(0, 300) : "";
        return [{ type: "image", attrs: { src, alt } }];
      }
      default:
        // Anything else, such as code or tables from a paste, is dropped with its text kept.
        return children(raw.content, depth + 1);
    }
  };
  const root = input as { type?: unknown; content?: unknown };
  if (typeof input !== "object" || input === null || root.type !== "doc") throw new Invalid();
  return { type: "doc", content: children(root.content, 0) };
}

export function tryCleanDoc(input: unknown): Doc | null {
  try {
    return cleanDoc(input);
  } catch {
    return null;
  }
}

/** The article's words, for reading time and search. Blocks become paragraphs. */
export function docText(doc: Doc): string {
  const blocks: string[] = [];
  const inline = (nodes: Node[] = []): string =>
    nodes.map((n) => (n.type === "text" ? n.text : n.type === "hardBreak" ? "\n" : "content" in n ? inline(n.content) : "")).join("");
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type === "paragraph" || n.type === "heading") {
        const text = inline(n.content).trim();
        if (text) blocks.push(text);
      } else if ("content" in n && n.content) walk(n.content);
    }
  };
  walk(doc.content);
  return blocks.join("\n\n");
}

export function docImages(doc: Doc): string[] {
  const found: string[] = [];
  const walk = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.type === "image") found.push(n.attrs.src);
      else if ("content" in n && n.content) walk(n.content);
    }
  };
  walk(doc.content);
  return found;
}

/** A plain article from before the editor, as a document. */
export const docFromText = (text: string): Doc => ({
  type: "doc",
  content: text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: p }] })),
});
