import { describe, expect, it } from "vitest";
import { POPUP_DEFAULTS, POPUP_SNOOZE_MS, popupAllowedOn, popupFromSettings, popupIsDue, popupSignupSchema } from "./popup";

describe("popupIsDue", () => {
  const now = 1_800_000_000_000;
  it("shows to a first-time visitor", () => {
    expect(popupIsDue(null, now)).toBe(true);
    expect(popupIsDue("not json", now)).toBe(true);
  });
  it("never shows again after signing up", () => {
    expect(popupIsDue(JSON.stringify({ subscribed: true }), now)).toBe(false);
  });
  it("stays away for 30 days after being closed", () => {
    expect(popupIsDue(JSON.stringify({ closedAt: now - 1000 }), now)).toBe(false);
    expect(popupIsDue(JSON.stringify({ closedAt: now - POPUP_SNOOZE_MS - 1 }), now)).toBe(true);
  });
});

describe("popupAllowedOn", () => {
  it("keeps out of sign-in pages and email links", () => {
    expect(popupAllowedOn("/")).toBe(true);
    expect(popupAllowedOn("/products/rice")).toBe(true);
    expect(popupAllowedOn("/sign-in")).toBe(false);
    expect(popupAllowedOn("/register")).toBe(false);
    expect(popupAllowedOn("/email/confirm")).toBe(false);
    expect(popupAllowedOn("/emails-are-great")).toBe(true);
  });
});

describe("popupFromSettings", () => {
  it("uses Super Admin's words, and the defaults for anything missing or blank", () => {
    const content = popupFromSettings([
      { key: "subscribe_popup.message_en", value: "Deals!" },
      { key: "subscribe_popup.button_en", value: "  " },
      { key: "subscribe_popup.enabled", value: false },
    ]);
    expect(content.enabled).toBe(false);
    expect(content.message).toEqual({ en: "Deals!", fr: POPUP_DEFAULTS.message.fr });
    expect(content.button.en).toBe("Subscribe");
    expect(popupFromSettings([]).message.en).toBe("Subscribe to get good deals with Biqbaq");
  });
});

describe("popupSignupSchema", () => {
  it("tidies the address, and refuses what is not one", () => {
    expect(popupSignupSchema.parse({ email: " Ada@Example.com ", locale: "fr" })).toEqual({ email: "ada@example.com", locale: "fr" });
    expect(popupSignupSchema.parse({ email: "a@b.co", locale: "de" }).locale).toBe("en");
    expect(popupSignupSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});
