import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichTextView } from "./rich-text-view";
import type { Doc } from "@/modules/blog/rich-text";

const view = (doc: Doc) => renderToStaticMarkup(<RichTextView doc={doc} />);

describe("RichTextView", () => {
  it("draws the formatting as safe elements", () => {
    const html = view({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Head" }] },
        { type: "paragraph", content: [{ type: "text", text: "Bold", marks: [{ type: "bold" }] }, { type: "text", text: "Link", marks: [{ type: "link", attrs: { href: "https://biqbaq.com" } }] }] },
      ],
    });
    expect(html).toContain("<h2");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain('href="https://biqbaq.com/"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("shows typed markup as text, never as code", () => {
    const html = view({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: '<img src=x onerror="alert(1)"><script>x</script>' }] }] });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("still refuses a bad link or photo that skipped the checks", () => {
    const html = view({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] },
        { type: "image", attrs: { src: "https://evil.com/x.png", alt: "" } },
      ],
    });
    expect(html).not.toContain("javascript");
    expect(html).not.toContain("evil.com");
  });
});
