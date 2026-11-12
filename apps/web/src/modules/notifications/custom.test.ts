import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import { renderInvoiceEmail } from "@/modules/invoicing/email";
import type { StoredInvoice } from "@/modules/invoicing";
import { buildAuthEmails } from "./auth-emails";
import { emailCatalog, findEmail, wordingProblem } from "./catalog";
import { customFromRows, fill, placeholdersIn } from "./custom";
import { renderEmail } from "./templates";

const SITE = "https://biqbaq.test";

describe("the email catalogue", () => {
  const catalog = emailCatalog();
  it("lists every email once, each with its original wording in both languages", () => {
    expect(catalog.length).toBe(47);
    expect(new Set(catalog.map((item) => item.template)).size).toBe(47);
    for (const item of catalog) {
      expect(item.fields.length).toBeGreaterThan(0);
      for (const field of item.fields) {
        expect(item.defaults.en[field]?.trim()).toBeTruthy();
        expect(item.defaults.fr[field]?.trim()).toBeTruthy();
      }
    }
    expect(catalog[0].template).toBe("auth_signup");
    expect(catalog[1].template).toBe("welcome");
  });

  it("names every email for Super Admin, in English and French", () => {
    const names = (messages: typeof en) => messages.emailTemplatesAdmin.names as Record<string, string>;
    for (const item of catalog) {
      expect(names(en)[item.template]).toBeTruthy();
      expect(names(fr)[item.template]).toBeTruthy();
    }
  });

  it("offers each email's own fill-ins, and its originals use only those", () => {
    for (const item of catalog) {
      for (const field of item.fields) expect(wordingProblem(item, { [field]: item.defaults.en[field]! })).toBeNull();
    }
    const order = findEmail("order_paid")!;
    expect(order.placeholders).toEqual(["product"]);
    expect(wordingProblem(order, { body: "Thanks for buying {product}" })).toBeNull();
    expect(wordingProblem(order, { body: "Thanks {password}" })).toBe("PLACEHOLDER_UNKNOWN");
    expect(wordingProblem(order, { action: "See {product}" })).toBe("PLACEHOLDER_UNKNOWN");
    expect(wordingProblem(order, { subject: "x" })).toBe("FIELD_UNKNOWN");
    expect(findEmail("nothing")).toBeNull();
  });
});

describe("Super Admin's wording in emails", () => {
  it("replaces the original, fills in values, and escapes everything", () => {
    const custom = customFromRows([
      { template: "order_paid", locale: "en", field: "body", value: "Great news!\n\nYour {product} is paid." },
      { template: "order_paid", locale: "en", field: "action", value: "Track it" },
    ]);
    const email = renderEmail("order_paid", { product: "<b>Suya</b>" }, { name: "Ada", locale: "en" }, SITE, custom)!;
    expect(email.text).toContain("Your <b>Suya</b> is paid.");
    expect(email.html).toContain("Your &lt;b&gt;Suya&lt;/b&gt; is paid.");
    expect(email.html).not.toContain("<b>Suya");
    expect(email.html).toContain(">Track it</a>");
    // Two paragraphs, as typed.
    expect(email.html.indexOf("Great news!")).toBeLessThan(email.html.indexOf("Your &lt;b&gt;"));
    expect(email.subject).toBe("Your order is paid");
    // French keeps its own original wording.
    expect(renderEmail("order_paid", { product: "Suya" }, { name: null, locale: "fr" }, SITE, custom)!.text).not.toContain("Great news");
  });

  it("uses the original where Super Admin's wording is blank", () => {
    const custom = customFromRows([{ template: "order_paid", locale: "en", field: "body", value: "   " }]);
    expect(renderEmail("order_paid", { product: "Suya" }, { name: null, locale: "en" }, SITE, custom)!.text).toContain("Your payment for Suya went through.");
  });

  it("changes the welcome email's heading, tiles and photos", () => {
    const custom = customFromRows(
      [
        { template: "welcome", locale: "en", field: "heading", value: "Hello there" },
        { template: "welcome", locale: "en", field: "tile_cargo", value: "Ship home" },
      ],
      { hero: "https://res.cloudinary.com/demo/hero.jpg" },
    );
    const email = renderEmail("welcome", {}, { name: "Ada", locale: "en" }, SITE, custom)!;
    expect(email.html).toContain(">Hello there</h1>");
    expect(email.html).toContain("Ship home &rarr;");
    expect(email.html).toContain('src="https://res.cloudinary.com/demo/hero.jpg"');
    expect(email.html).toContain(`${SITE}/email/tile-products.jpg`);
  });

  it("rewords account and invoice emails too", () => {
    const custom = customFromRows([
      { template: "auth_signup", locale: "en", field: "body", value: "One more step to join Biqbaq." },
      { template: "invoice_email", locale: "en", field: "body", value: "{sender} sent {number} ({total})." },
    ]);
    const [signup] = buildAuthEmails(
      { user: { email: "a@example.com", user_metadata: {} }, email_data: { email_action_type: "signup", token: "", token_hash: "h", token_new: "", token_hash_new: "", redirect_to: "" } },
      "https://api.test",
      custom,
    );
    expect(signup.email.text).toContain("One more step to join Biqbaq.");
    const invoice = renderInvoiceEmail({ kind: "invoice", label: "INV-1", client_name: "Bo", total_minor: 1000, sender_name: "Ada's Shop", sender_address: "Toronto" } as StoredInvoice, "en", custom);
    expect(invoice.text).toContain("Ada's Shop sent INV-1 ($10.00).");
  });

  it("fills only known values", () => {
    expect(fill("{shop} and {other}", { shop: "Ada" })).toBe("Ada and {other}");
    expect(placeholdersIn("{a} {b} {a}")).toEqual(["a", "b"]);
  });
});
