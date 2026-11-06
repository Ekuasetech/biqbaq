import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

function keys(value: object, prefix = ""): string[] {
  return Object.entries(value)
    .flatMap(([k, v]) => (typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
    .sort();
}

describe("translations", () => {
  it("has the same keys in English and French", () => {
    expect(keys(fr)).toEqual(keys(en));
  });
});
