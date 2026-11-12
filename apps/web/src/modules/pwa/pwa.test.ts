import { describe, expect, it } from "vitest";
import { INSTALL_HINT_SNOOZE_MS, installHintDue, installWay } from "./index";
import manifest from "@/app/manifest";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

describe("installWay", () => {
  const base = { standalone: false, canPrompt: false, maxTouchPoints: 5 };
  it("uses the browser's own install prompt where it has one", () => {
    expect(installWay({ ...base, userAgent: ANDROID, canPrompt: true })).toBe("prompt");
  });
  it("explains Safari's Share menu on iPhone and iPad", () => {
    expect(installWay({ ...base, userAgent: IPHONE_SAFARI })).toBe("ios");
    expect(installWay({ ...base, userAgent: IPAD })).toBe("ios");
  });
  it("offers nothing where it cannot be done, or once installed", () => {
    expect(installWay({ ...base, userAgent: IPHONE_CHROME })).toBeNull();
    expect(installWay({ ...base, userAgent: IPAD, maxTouchPoints: 0 })).toBeNull();
    expect(installWay({ ...base, userAgent: ANDROID })).toBeNull();
    expect(installWay({ ...base, userAgent: IPHONE_SAFARI, standalone: true })).toBeNull();
  });
});

describe("installHintDue", () => {
  const now = 1_800_000_000_000;
  it("offers it once, then waits 30 days after Not now, and never again once installed", () => {
    expect(installHintDue(null, now)).toBe(true);
    expect(installHintDue(JSON.stringify({ dismissedAt: now - 1000 }), now)).toBe(false);
    expect(installHintDue(JSON.stringify({ dismissedAt: now - INSTALL_HINT_SNOOZE_MS - 1 }), now)).toBe(true);
    expect(installHintDue(JSON.stringify({ installed: true }), now)).toBe(false);
    expect(installHintDue("{broken", now)).toBe(true);
  });
});

describe("the web app manifest", () => {
  it("names Biqbaq, opens full screen in its colours, and has every icon a phone needs", () => {
    const app = manifest();
    expect(app).toMatchObject({ name: "Biqbaq", short_name: "Biqbaq", display: "standalone", theme_color: "#0c2352", start_url: "/?source=app" });
    expect(app.icons?.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });
});
