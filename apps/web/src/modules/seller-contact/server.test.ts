import { describe, expect, it } from "vitest";
import { clientAddress, hashForLog, renderEnquiryEmail } from "./server";

const enquiry = { name: "Ada", email: "ada@mail.ca", subject: "Availability", message: "Is this in stock?\nThanks" };
const product = { name: "Tote bag", slug: "tote-bag" };

describe("renderEnquiryEmail", () => {
  it("gives the seller everything needed to reply", () => {
    const email = renderEnquiryEmail(enquiry, product, "en", "https://biqbaq.test/");
    expect(email.subject).toBe("Biqbaq enquiry: Availability");
    expect(email.text).toContain("Ada <ada@mail.ca>");
    expect(email.text).toContain("Is this in stock?\nThanks");
    expect(email.text).toContain("https://biqbaq.test/products/tote-bag");
    expect(email.text).toContain("shows them your email address");
  });

  it("uses the seller's language", () => {
    const email = renderEnquiryEmail(enquiry, product, "fr", "https://biqbaq.test");
    expect(email.subject.startsWith("Demande Biqbaq")).toBe(true);
    expect(email.text).toContain("https://biqbaq.test/fr/products/tote-bag");
  });

  it("cannot be used to inject markup through anything a visitor types", () => {
    const attack = `<img src=x onerror=alert(1)>`;
    const email = renderEnquiryEmail({ name: attack, email: "a@b.ca", subject: attack, message: `<script>x</script>${attack}` }, product, "en", "https://biqbaq.test");
    // The layout has images of its own (the logo); what the visitor typed must not.
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img src=x");
    expect(email.html).not.toContain("<script");
  });
});

describe("hashForLog", () => {
  it("treats the same address alike, and depends on the secret", () => {
    expect(hashForLog("s", " Ada@Mail.ca ")).toBe(hashForLog("s", "ada@mail.ca"));
    expect(hashForLog("s", "ada@mail.ca")).not.toBe(hashForLog("t", "ada@mail.ca"));
    expect(hashForLog("s", "ada@mail.ca")).not.toContain("ada");
  });
});

describe("clientAddress", () => {
  it("uses the entry a visitor cannot make up", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" }))).toBe("1.2.3.4");
    expect(clientAddress(new Headers({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "6.6.6.6" }))).toBe("9.9.9.9");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
