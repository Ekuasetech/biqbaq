import { afterEach, describe, expect, it, vi } from "vitest";
import { siteOrigin } from "./site-origin";

describe("siteOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the public site address, not the proxy's internal one", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.biqbaq.com/");
    expect(siteOrigin(new Request("https://localhost:10000/api/v1/auth/callback?code=x"))).toBe("https://www.biqbaq.com");
  });

  it("falls back to the request's address when no site address is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(siteOrigin(new Request("http://localhost:3000/api/v1/auth/callback"))).toBe("http://localhost:3000");
  });
});
