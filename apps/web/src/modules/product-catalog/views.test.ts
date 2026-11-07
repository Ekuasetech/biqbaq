import { describe, expect, it } from "vitest";
import { isBot, visitorKey } from "./views";

describe("isBot", () => {
  it("skips crawlers, previews and scripts", () => {
    for (const agent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "WhatsApp link preview",
      "curl/8.4.0",
      "python-requests/2.31",
      "",
      null,
    ]) expect(isBot(agent), String(agent)).toBe(true);
  });
  it("counts real browsers", () => {
    for (const agent of [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
    ]) expect(isBot(agent), agent).toBe(false);
  });
});

describe("visitorKey", () => {
  it("uses the account when there is one, so one person on two devices is one view", () => {
    expect(visitorKey("u1", "1.2.3.4", "Safari")).toBe(visitorKey("u1", "5.6.7.8", "Chrome"));
  });
  it("tells signed-out visitors apart by address and browser", () => {
    expect(visitorKey(null, "1.2.3.4", "Safari")).not.toBe(visitorKey(null, "1.2.3.4", "Chrome"));
    expect(visitorKey(null, "1.2.3.4", "Safari")).not.toBe(visitorKey(null, "5.6.7.8", "Safari"));
  });
});
