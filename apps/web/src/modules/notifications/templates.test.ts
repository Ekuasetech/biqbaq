import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates";

const TEMPLATES = [
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
