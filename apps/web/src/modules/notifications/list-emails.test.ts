import { describe, expect, it } from "vitest";
import { isListTemplate, renderListEmail } from "./list-emails";

const SITE = "https://biqbaq.test";
const token = "a".repeat(64);
const bulk = { shop: "Adire Studio", subject: "New prints", body: "Hello <b>friends</b>\n\nSee you soon", address: "12 King St W, Toronto", token, source: "added" };

describe("list emails", () => {
  it("ask for confirmation with a link, before anything else is sent", () => {
    const result = renderListEmail("list_confirm", { shop: "Adire Studio", token }, SITE);
    expect(result?.email.subject).toBe("Confirm you want emails from Adire Studio");
    expect(result?.email.text).toContain(`${SITE}/email/confirm?t=${token}`);
  });

  it("say who sent a bulk email, why, and where they are, with unsubscribe (CASL)", () => {
    const result = renderListEmail("bulk_email", bulk, SITE)!;
    expect(result.email.subject).toBe("New prints");
    expect(result.email.text).toContain("Sent by Adire Studio through Biqbaq.");
    expect(result.email.text).toContain("you agreed to hear from Adire Studio");
    expect(result.email.text).toContain("Mailing address: 12 King St W, Toronto");
    expect(result.email.text).toContain(`Unsubscribe: ${SITE}/email/unsubscribe?t=${token}`);
    expect(result.headers).toEqual({
      "List-Unsubscribe": `<${SITE}/api/v1/email/unsubscribe?t=${token}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("tells an existing customer why they hear from the shop", () => {
    expect(renderListEmail("bulk_email", { ...bulk, source: "customer" }, SITE)!.email.text).toContain("because you're a customer of Adire Studio");
  });

  it("shows what the shop wrote as text, never markup", () => {
    const html = renderListEmail("bulk_email", bulk, SITE)!.email.html;
    expect(html).toContain("Hello &lt;b&gt;friends&lt;/b&gt;");
    expect(html).not.toContain("<b>friends</b>");
  });

  it("writes to French speakers in French", () => {
    const result = renderListEmail("bulk_email", { ...bulk, locale: "fr", source: "self" }, SITE)!;
    expect(result.email.text).toContain("Envoyé par Adire Studio par Biqbaq.");
    expect(result.email.text).toContain(`${SITE}/fr/email/unsubscribe?t=${token}`);
  });

  it("sends nothing half-made", () => {
    expect(renderListEmail("bulk_email", { ...bulk, address: "" }, SITE)).toBeNull();
    expect(renderListEmail("bulk_email", { ...bulk, token: "short" }, SITE)).toBeNull();
    expect(renderListEmail("something_else", bulk, SITE)).toBeNull();
    expect(isListTemplate("bulk_email")).toBe(true);
    expect(isListTemplate("welcome")).toBe(false);
  });

  it("send a new blog post with its title as the subject, a link to it, and unsubscribe (Q-68)", () => {
    const post = {
      shop: "Biqbaq",
      subject: "Shipping a car to <Lagos>",
      body: "What it costs",
      slug: "shipping-a-car",
      cover: "https://res.cloudinary.com/demo/cover.jpg",
      address: "12 King St W, Toronto",
      token,
      source: "self",
    };
    const result = renderListEmail("blog_post", post, SITE)!;
    expect(result.email.subject).toBe("Shipping a car to <Lagos>");
    expect(result.email.html).toContain("Shipping a car to &lt;Lagos&gt;");
    expect(result.email.html).toContain(`href="${SITE}/blog/shipping-a-car"`);
    expect(result.email.html).toContain('src="https://res.cloudinary.com/demo/cover.jpg"');
    expect(result.email.text).toContain(`Read the post: ${SITE}/blog/shipping-a-car`);
    expect(result.email.text).toContain("you chose to get updates from Biqbaq");
    expect(result.email.text).toContain("Mailing address: 12 King St W, Toronto");
    expect(result.headers?.["List-Unsubscribe"]).toBe(`<${SITE}/api/v1/email/unsubscribe?t=${token}>`);
    expect(renderListEmail("blog_post", { ...post, locale: "fr" }, SITE)!.email.text).toContain(`Lire l'article : ${SITE}/fr/blog/shipping-a-car`.replace(" :", ":"));
    // Only Biqbaq's own photos, and never half an email.
    expect(renderListEmail("blog_post", { ...post, cover: "https://evil.example/x.jpg" }, SITE)!.email.html).not.toContain("evil.example");
    expect(renderListEmail("blog_post", { ...post, slug: "../x" }, SITE)).toBeNull();
    expect(renderListEmail("blog_post", { ...post, address: "" }, SITE)).toBeNull();
    expect(isListTemplate("blog_post")).toBe(true);
  });
});
