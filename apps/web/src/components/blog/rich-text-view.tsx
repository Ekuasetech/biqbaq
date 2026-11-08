import type { ReactNode } from "react";
import { safeHref, type Doc, type Mark, type Node } from "@/modules/blog/rich-text";

// Draws an article from its structure. It never inserts HTML, and checks links and photos
// again here, so even a document that skipped the editor cannot put code on the page.

function withMarks(text: string, marks: Mark[] = [], key: string): ReactNode {
  return marks.reduce<ReactNode>((child, mark, index) => {
    const k = `${key}-${index}`;
    switch (mark.type) {
      case "bold":
        return <strong key={k}>{child}</strong>;
      case "italic":
        return <em key={k}>{child}</em>;
      case "underline":
        return <u key={k}>{child}</u>;
      case "strike":
        return <s key={k}>{child}</s>;
      case "link": {
        const href = safeHref(mark.attrs.href);
        if (!href) return child;
        const external = !href.startsWith("mailto:");
        return (
          <a key={k} href={href} className="font-medium text-brand-red underline underline-offset-4 dark:text-red-400" {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {child}
          </a>
        );
      }
    }
  }, text);
}

function render(nodes: Node[] = [], path: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${path}.${index}`;
    switch (node.type) {
      case "text":
        return withMarks(node.text, node.marks, key);
      case "hardBreak":
        return <br key={key} />;
      case "horizontalRule":
        return <hr key={key} className="my-8 border-border" />;
      case "paragraph":
        return <p key={key} className="mt-4 break-words leading-relaxed">{render(node.content, key)}</p>;
      case "heading":
        return node.attrs.level === 3 ? (
          <h3 key={key} className="mt-6 font-heading text-xl font-bold tracking-tight">{render(node.content, key)}</h3>
        ) : (
          <h2 key={key} className="mt-8 font-heading text-2xl font-bold tracking-tight">{render(node.content, key)}</h2>
        );
      case "blockquote":
        return <blockquote key={key} className="mt-4 border-l-4 border-brand-red pl-4 italic text-muted-foreground">{render(node.content, key)}</blockquote>;
      case "bulletList":
        return <ul key={key} className="mt-4 list-disc space-y-1 pl-6">{render(node.content, key)}</ul>;
      case "orderedList":
        return <ol key={key} start={node.attrs?.start ?? 1} className="mt-4 list-decimal space-y-1 pl-6">{render(node.content, key)}</ol>;
      case "listItem":
        return <li key={key} className="[&>p]:mt-0">{render(node.content, key)}</li>;
      case "image":
        return /^https:\/\/res\.cloudinary\.com\//.test(node.attrs.src) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={key} src={node.attrs.src} alt={node.attrs.alt} loading="lazy" decoding="async" className="mt-6 w-full rounded-2xl" />
        ) : null;
      default:
        return null;
    }
  });
}

export function RichTextView({ doc }: { doc: Doc }) {
  return <div className="rich-text">{render(doc.content, "n")}</div>;
}
