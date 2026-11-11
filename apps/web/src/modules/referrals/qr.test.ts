import { describe, expect, it } from "vitest";
import { qrFileName, qrPreview } from "./qr";

describe("referral QR codes", () => {
  it("names the download after the code, safely", () => {
    expect(qrFileName("ADA2026")).toBe("biqbaq-referral-ada2026.png");
    expect(qrFileName("A/B C")).toBe("biqbaq-referral-abc.png");
  });

  it("draws the link as a PNG image, the same each time", async () => {
    const first = await qrPreview("https://biqbaq.com/r/ADA2026");
    expect(first.startsWith("data:image/png;base64,")).toBe(true);
    expect(await qrPreview("https://biqbaq.com/r/ADA2026")).toBe(first);
    expect(await qrPreview("https://biqbaq.com/r/OTHER")).not.toBe(first);
  });
});
