import { describe, expect, it } from "vitest";
import { emailLayout, withTopNote } from "./layout";
import { renderEmail } from "./templates";

const SITE = "https://biqbaq.test";

describe("the email design", () => {
  it("puts every email in Biqbaq's colours, with the logo at the bottom", () => {
    const html = emailLayout({ locale: "en", siteUrl: SITE, content: "<p>Hi</p>" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("#0c2352");
    expect(html).toContain("#041335");
    const logo = html.indexOf(`${SITE}/biqbaq.png`);
    expect(logo).toBeGreaterThan(html.indexOf("<p>Hi</p>"));
    expect(html).toContain("Biqbaq connects Nigerians in Canada");
  });

  it("gives the welcome email the full design: photo, Welcome panel and two tiles", () => {
    const email = renderEmail("welcome", {}, { name: "Ada", locale: "en" }, SITE)!;
    expect(email.subject).toBe("Welcome to Biqbaq");
    expect(email.html).toContain(`${SITE}/email/welcome-hero.jpg`);
    expect(email.html).toContain(">Welcome to Biqbaq</h1>");
    expect(email.html).toContain(`href="${SITE}/products"`);
    expect(email.html).toContain(`href="${SITE}/cargo-cars"`);
    expect(email.html).toContain("Shop products");
    expect(email.text).toContain(`Find cargo cars: ${SITE}/cargo-cars`);
    const french = renderEmail("welcome", {}, { name: null, locale: "fr" }, SITE)!;
    expect(french.html).toContain(">Bienvenue sur Biqbaq</h1>");
    expect(french.html).toContain(`href="${SITE}/fr/cargo-cars"`);
  });

  it("gives other emails the shared look, with the action as a red button, and no welcome photo", () => {
    const email = renderEmail("application_approved", { role: "seller" }, { name: "Ada", locale: "en" }, SITE)!;
    expect(email.html).toContain("background:#d01d21");
    expect(email.html).toContain(`href="${SITE}/account"`);
    expect(email.html).not.toContain("welcome-hero");
  });

  it("puts a test note at the top of the body, not before the page", () => {
    const html = withTopNote(emailLayout({ locale: "en", siteUrl: SITE, content: "x" }), "Test email");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.indexOf("Test email")).toBeGreaterThan(html.indexOf("<body"));
  });
});
