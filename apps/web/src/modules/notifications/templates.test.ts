import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates";

const TEMPLATES = [
  "welcome",
  "staff_invitation",
  "staff_approved",
  "staff_suspended",
  "staff_restored",
  "staff_removed",
  "role_assigned",
  "role_suspended",
  "role_restored",
  "role_revoked",
  "product_suspended",
  "product_restored",
  "message_to_seller",
  "message_to_buyer",
  "bulk_email_enabled",
  "bulk_email_disabled",
  "bulk_email_paused",
  "bulk_email_paused_admin",
  "payments_enabled",
  "payments_disabled",
  "order_paid",
  "order_received",
  "order_refunded",
  "order_fulfilled",
  "order_disputed",
  "shop_suspended",
  "shop_restored",
  "publishing_suspended",
  "publishing_restored",
  "application_received",
  "application_approved",
  "application_rejected",
  "verification_verified",
  "verification_rejected",
  "verification_suspended",
  "verification_restored",
  "verification_revoked",
];
const SITE = "https://biqbaq.test/";
const person = { name: "Ada", locale: "en" };

describe("renderEmail", () => {
  it("renders every template in both languages, with a working link", () => {
    for (const template of TEMPLATES) {
      for (const locale of ["en", "fr"]) {
        const email = renderEmail(template, { role: "seller" }, { name: "Ada", locale }, SITE);
        expect(email?.subject.length).toBeGreaterThan(0);
        expect(email?.text).toContain("Ada");
        expect(email?.text).toContain(locale === "fr" ? "https://biqbaq.test/fr/" : "https://biqbaq.test/a");
        expect(email?.text).not.toContain("undefined");
      }
    }
  });

  it("names the shop in message emails, without any message text", () => {
    const email = renderEmail("message_to_buyer", { shop: "Adire Studio" }, person, SITE);
    expect(email?.text).toContain("Adire Studio sent you a message");
    expect(email?.text).toContain("https://biqbaq.test/account/messages");
  });

  it("uses the role's name, not its key", () => {
    expect(renderEmail("application_approved", { role: "seller_staff" }, person, SITE)?.text).toContain("Seller Staff");
    expect(renderEmail("application_approved", { role: "seller_staff" }, { name: null, locale: "fr" }, SITE)?.text).toContain("Personnel du vendeur");
  });

  it("includes a reason only on the emails written to show one", () => {
    expect(renderEmail("application_rejected", { role: "seller", reason: "Too short" }, person, SITE)?.text).toContain("Reason: Too short");
    expect(renderEmail("verification_rejected", { reason: "Too short" }, person, SITE)?.text).toContain("Reason: Too short");
    expect(renderEmail("verification_suspended", { reason: "Expired" }, person, SITE)?.text).toContain("Reason: Expired");
    expect(renderEmail("verification_revoked", { reason: "Closed" }, person, SITE)?.html).toContain("Closed");
    expect(renderEmail("verification_restored", { reason: "internal note" }, person, SITE)?.text).not.toContain("internal note");
    expect(renderEmail("verification_verified", { reason: "internal note" }, person, SITE)?.html).not.toContain("internal note");
  });

  it("names every role a person can be given, not its key", () => {
    for (const role of ["admin", "co_admin", "super_admin", "marketer"]) {
      const text = renderEmail("role_assigned", { role }, person, SITE)?.text;
      expect(text).not.toContain(`the ${role} role`);
    }
    expect(renderEmail("role_assigned", { role: "co_admin" }, person, SITE)?.text).toContain("Co-admin");
  });

  it("names the shop in staff emails, and keeps it out of the subject and markup", () => {
    const email = renderEmail("staff_invitation", { shop: "Ada <b>Shop</b>" }, person, SITE);
    expect(email?.text).toContain("Ada <b>Shop</b> has invited you");
    expect(email?.html).not.toContain("<b>");
    expect(email?.subject).not.toContain("Ada");
  });

  it("names the product and gives the reason, keeping the product name out of the subject", () => {
    const email = renderEmail("product_suspended", { product: "Tote <b>bag</b>", reason: "Fake" }, person, SITE);
    expect(email?.text).toContain('"Tote <b>bag</b>"');
    expect(email?.text).toContain("Reason: Fake");
    expect(email?.html).not.toContain("<b>");
    expect(email?.subject).not.toContain("Tote");
  });

  it("cannot be used to inject markup through a name or reason", () => {
    const email = renderEmail(
      "application_rejected",
      { role: "seller", reason: `<img src=x onerror=alert(1)>"'` },
      { name: "<script>alert(1)</script>", locale: "en" },
      SITE,
    );
    expect(email?.html).not.toContain("<script");
    expect(email?.html).not.toContain("<img");
    expect(email?.html).toContain("&lt;img");
  });

  it("keeps what people typed out of the subject", () => {
    const email = renderEmail("application_rejected", { role: "seller", reason: "x\r\nBcc: a@b.c" }, { name: "x\r\nBcc: a@b.c", locale: "en" }, SITE);
    expect(email?.subject).toBe("Your application was not approved");
  });

  it("falls back to English and greets without a name", () => {
    const email = renderEmail("verification_verified", {}, { name: null, locale: null }, SITE);
    expect(email?.text.startsWith("Hello,")).toBe(true);
  });

  it("returns nothing for an unknown template, including object built-ins", () => {
    expect(renderEmail("nope", {}, person, SITE)).toBeNull();
    expect(renderEmail("constructor", {}, person, SITE)).toBeNull();
    expect(renderEmail("__proto__", {}, person, SITE)).toBeNull();
  });
});
