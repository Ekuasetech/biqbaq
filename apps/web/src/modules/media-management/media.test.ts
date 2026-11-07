import { describe, expect, it } from "vitest";
import { assetProblem, isOwnPublicId, shrinkSteps, type MediaLimits } from "./rules";
import { signParams } from "./signature";

const limits: MediaLimits = { max_images: 5, max_bytes: 1048576, max_dimension: 4000, formats: ["jpg", "png", "webp"] };
const good = { bytes: 1000, format: "jpg", width: 800, height: 600 };
const product = "11111111-1111-4111-8111-111111111111";
const file = "22222222-2222-4222-8222-222222222222";

describe("signParams", () => {
  it("matches the example in Cloudinary's documentation", () => {
    // public_id=sample_image&timestamp=1315060510 with the secret abcd
    expect(signParams({ timestamp: 1315060510, public_id: "sample_image" }, "abcd")).toBe("b4ad47fb4e25c7bf5f92a20089f9db59bc302313");
  });
});

describe("assetProblem", () => {
  it("accepts a file within every limit, at the exact limits too", () => {
    expect(assetProblem(good, limits)).toBeNull();
    expect(assetProblem({ ...good, bytes: 1048576, width: 4000, height: 4000 }, limits)).toBeNull();
  });

  it("refuses what breaks a limit", () => {
    expect(assetProblem({ ...good, bytes: 1048577 }, limits)).toBe("size");
    expect(assetProblem({ ...good, width: 4001 }, limits)).toBe("dimensions");
    expect(assetProblem({ ...good, height: 4001 }, limits)).toBe("dimensions");
    expect(assetProblem({ ...good, format: "gif" }, limits)).toBe("format");
    expect(assetProblem({ ...good, format: "svg" }, limits)).toBe("format");
  });
});

describe("isOwnPublicId", () => {
  it("accepts only a file named for this product", () => {
    expect(isOwnPublicId(`biqbaq/products/${product}/${file}`, "biqbaq", product)).toBe(true);
  });

  it.each([
    `biqbaq/products/33333333-3333-4333-8333-333333333333/${file}`,
    `other/products/${product}/${file}`,
    `biqbaq/products/${product}/not-a-uuid`,
    `biqbaq/products/${product}/${file}/extra`,
    `biqbaq/products/${product}/../../somewhere/${file}`,
    "someone-elses-file",
  ])("refuses %s", (publicId) => {
    expect(isOwnPublicId(publicId, "biqbaq", product)).toBe(false);
  });
});

describe("shrinkSteps", () => {
  it("never makes a small photo bigger, or goes over the limit", () => {
    expect(shrinkSteps(800, 600, 4000)[0]).toEqual({ width: 800, height: 600, quality: 0.85 });
    for (const step of shrinkSteps(9000, 3000, 4000)) expect(Math.max(step.width, step.height)).toBeLessThanOrEqual(2000);
    for (const step of shrinkSteps(3000, 3000, 1000)) expect(Math.max(step.width, step.height)).toBeLessThanOrEqual(1000);
  });

  it("keeps the shape, tries smaller sizes, and always ends", () => {
    const steps = shrinkSteps(4000, 2000, 4000);
    expect(steps[0]).toEqual({ width: 2000, height: 1000, quality: 0.85 });
    expect(steps.at(-1)).toEqual({ width: 400, height: 200, quality: 0.55 });
    expect(shrinkSteps(1, 1, 4000).length).toBeGreaterThan(0);
  });
});
