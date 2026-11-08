import { describe, expect, it } from "vitest";
import { normalizeCode, parseReferral, referralErrorKey, referralUrl, serializeReferral } from "./index";

const now = new Date("2026-11-08T12:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);

describe("referral codes", () => {
  it("accept letters and numbers, in capitals", () => {
    expect(normalizeCode(" ada2026 ")).toBe("ADA2026");
    expect(normalizeCode("ad")).toBeNull();
    expect(normalizeCode("ADA-2026")).toBeNull();
    expect(normalizeCode("<script>")).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });

  it("make a link to sign-up, in the person's language", () => {
    expect(referralUrl("https://biqbaq.com/", "ADA2026")).toBe("https://biqbaq.com/register?ref=ADA2026");
    expect(referralUrl("https://biqbaq.com", "ADA2026", "fr")).toBe("https://biqbaq.com/fr/register?ref=ADA2026");
  });
});

describe("remembered referral", () => {
  it("lasts 30 days from when the link was opened (BD-11)", () => {
    expect(parseReferral(serializeReferral("ADA2026", daysAgo(29)), now)?.code).toBe("ADA2026");
    expect(parseReferral(serializeReferral("ADA2026", daysAgo(31)), now)).toBeNull();
  });

  it("ignores anything tampered with", () => {
    expect(parseReferral("ADA2026", now)).toBeNull();
    expect(parseReferral("ADA2026.soon", now)).toBeNull();
    expect(parseReferral(`bad code.${now.getTime()}`, now)).toBeNull();
    expect(parseReferral(serializeReferral("ADA2026", new Date(now.getTime() + 86400000)), now)).toBeNull();
  });
});

describe("referralErrorKey", () => {
  it("maps refusals to messages", () => {
    expect(referralErrorKey({ code: "23505", message: "CODE_TAKEN" })).toBe("codeTaken");
    expect(referralErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(referralErrorKey({ code: "XX000", message: "details" })).toBe("generic");
  });
});
