import { describe, expect, it } from "vitest";
import { findSetting, parseSettingInput, SETTING_GROUPS, settingErrorKey, settingInputValue } from "./index";

const setting = (key: string) => findSetting(key)!;

describe("parseSettingInput", () => {
  it("reads numbers within their limits", () => {
    expect(parseSettingInput(setting("media.max_images"), "6")).toBe(6);
    expect(parseSettingInput(setting("publishing.unverified_allowance"), "0")).toBe(0);
  });
  it("refuses numbers it should", () => {
    for (const bad of ["0", "21", "2.5", "-1", "", "six", "1e1", " "]) {
      expect(parseSettingInput(setting("media.max_images"), bad)).toBeNull();
    }
  });
  it("stores megabytes as bytes", () => {
    expect(parseSettingInput(setting("media.max_image_bytes"), "1")).toBe(1048576);
    expect(parseSettingInput(setting("media.max_image_bytes"), "0.5")).toBe(524288);
    expect(parseSettingInput(setting("media.max_image_bytes"), "11")).toBeNull();
    expect(parseSettingInput(setting("media.max_image_bytes"), "0.05")).toBeNull();
  });
  it("keeps formats known, in order, and not empty", () => {
    expect(parseSettingInput(setting("media.allowed_formats"), ["webp", "jpg"])).toEqual(["jpg", "webp"]);
    expect(parseSettingInput(setting("media.allowed_formats"), ["svg"])).toEqual([]);
    expect(parseSettingInput(setting("media.allowed_formats"), [])).toBeNull();
  });
  it("only takes true or false for a switch", () => {
    expect(parseSettingInput(setting("email.notifications_enabled"), false)).toBe(false);
    expect(parseSettingInput(setting("email.notifications_enabled"), "false")).toBeNull();
  });
});

describe("settingInputValue", () => {
  it("shows bytes as megabytes, and round-trips", () => {
    expect(settingInputValue(setting("media.max_image_bytes"), 1048576)).toBe("1");
    expect(settingInputValue(setting("media.max_image_bytes"), 524288)).toBe("0.5");
    expect(settingInputValue(setting("media.max_images"), 5)).toBe("5");
  });
});

describe("SETTING_GROUPS", () => {
  it("has unique keys and message names, with no dots in message names", () => {
    const all = SETTING_GROUPS.flatMap((group) => group.settings);
    expect(new Set(all.map((s) => s.key)).size).toBe(all.length);
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length);
    for (const s of all) expect(s.id).not.toContain(".");
  });
  it("leaves out settings for features that are not built", () => {
    expect(findSetting("blog.seller_publishing_enabled")).toBeUndefined();
  });
});

describe("settingErrorKey", () => {
  it("maps refusals to messages, without exposing their wording", () => {
    expect(settingErrorKey({ code: "23514", message: "REASON_REQUIRED" })).toBe("reasonRequired");
    expect(settingErrorKey({ code: "23514", message: "SETTING_OUT_OF_RANGE" })).toBe("invalidValue");
    expect(settingErrorKey({ code: "42501", message: "NOT_AUTHORIZED" })).toBe("notAllowed");
    expect(settingErrorKey({ code: "XX000", message: "internal details" })).toBe("generic");
  });
});
