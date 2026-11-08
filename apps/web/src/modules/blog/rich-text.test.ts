import { describe, expect, it } from "vitest";
import { cleanDoc, docFromText, docImages, docText, safeHref, tryCleanDoc } from "./rich-text";

const CLOUD = "https://res.cloudinary.com/demo/image/upload/v1/biqbaq/blog/x.jpg";
const doc = (content: unknown[]) => ({ type: "doc", content });
const p = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, ...(marks ? { marks } : {}) });

describe("safeHref", () => {
  it("keeps web and email links", () => {
    expect(safeHref("https://biqbaq.com/a?b=1")).toBe("https://biqbaq.com/a?b=1");
    expect(safeHref("http://example.org")).toBe("http://example.org/");
    expect(safeHref("mailto:hello@biqbaq.com")).toBe("mailto:hello@biqbaq.com");
  });
  it("refuses anything that could run code or mislead", () => {
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<script>x</script>", "vbscript:x", "file:///etc/passwd", "//evil.com", "/relative", "mailto:", "", null, 5, "x".repeat(2001)]) {
      expect(safeHref(bad), String(bad)).toBeNull();
    }
  });
});

describe("cleanDoc", () => {
  it("keeps the chosen formatting", () => {
    const input = doc([
      { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
      p(text("a", [{ type: "bold" }, { type: "italic" }, { type: "underline" }, { type: "strike" }]), { type: "hardBreak" }, text("b")),
      { type: "bulletList", content: [{ type: "listItem", content: [p(text("one"))] }] },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", content: [p(text("two"))] }] },
      { type: "blockquote", content: [p(text("quote"))] },
      { type: "horizontalRule" },
      { type: "image", attrs: { src: CLOUD, alt: "A photo" } },
    ]);
    expect(cleanDoc(input)).toEqual(input);
  });

  it("drops links that are not web or email addresses, but keeps their text", () => {
    const out = cleanDoc(doc([p(text("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }]))]));
    expect(out).toEqual(doc([p(text("click"))]));
  });

  it("drops attributes it does not know, including event handlers and styles", () => {
    const out = cleanDoc(doc([{ type: "paragraph", attrs: { onclick: "x", style: "x" }, content: [text("a", [{ type: "link", attrs: { href: "https://a.ca", onclick: "x", target: "_top" } }])] }]));
    expect(JSON.stringify(out)).not.toMatch(/onclick|style|_top/);
  });

  it("turns unknown blocks into their text, so a paste from elsewhere is safe", () => {
    const out = cleanDoc(doc([{ type: "codeBlock", content: [text("let x")] }, { type: "table", content: [{ type: "iframe", attrs: { src: "https://evil" } }] }]));
    expect(out).toEqual(doc([text("let x")]));
  });

  it("keeps headings to two levels, and repairs odd list numbers", () => {
    expect(cleanDoc(doc([{ type: "heading", attrs: { level: 1 } }])).content[0]).toEqual({ type: "heading", attrs: { level: 2 }, content: [] });
    expect(cleanDoc(doc([{ type: "orderedList", attrs: { start: -5 } }])).content[0]).toMatchObject({ attrs: { start: 1 } });
  });

  it("refuses photos that are not uploaded to Biqbaq's Cloudinary", () => {
    for (const src of ["https://evil.com/x.jpg", "javascript:x", "https://res.cloudinary.com/x\"onerror=\"y", "http://res.cloudinary.com/demo/x.jpg"]) {
      expect(tryCleanDoc(doc([{ type: "image", attrs: { src } }])), src).toBeNull();
    }
  });

  it("refuses what is not a document, or too big or deep", () => {
    expect(tryCleanDoc({ type: "paragraph" })).toBeNull();
    expect(tryCleanDoc("<p>x</p>")).toBeNull();
    expect(tryCleanDoc(doc([p(text("x".repeat(50001)))]))).toBeNull();
    let deep: unknown = p(text("x"));
    for (let i = 0; i < 20; i += 1) deep = { type: "blockquote", content: [deep] };
    expect(tryCleanDoc(doc([deep]))).toBeNull();
    expect(tryCleanDoc(doc(Array.from({ length: 6000 }, () => ({ type: "horizontalRule" }))))).toBeNull();
  });
});

describe("docText and docImages", () => {
  it("collects the words as paragraphs, and the photos", () => {
    const d = cleanDoc(doc([{ type: "heading", attrs: { level: 2 }, content: [text("Head")] }, p(text("One "), text("two")), { type: "image", attrs: { src: CLOUD, alt: "" } }, { type: "bulletList", content: [{ type: "listItem", content: [p(text("Item"))] }] }]));
    expect(docText(d)).toBe("Head\n\nOne two\n\nItem");
    expect(docImages(d)).toEqual([CLOUD]);
  });
  it("turns an old plain article into a document", () => {
    expect(docFromText("A\n\nB")).toEqual(doc([p(text("A")), p(text("B"))]));
  });
});
