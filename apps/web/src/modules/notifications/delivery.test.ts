import { describe, expect, it } from "vitest";
import { isRetriableStatus, resolveDelivery } from "./delivery";

const configured = { apiKey: "re_x", from: "Biqbaq <a@b.ca>" };

describe("resolveDelivery", () => {
  it("sends every email to the test address when one is set, even with live sending on", () => {
    expect(resolveDelivery("real@gmail.com", { ...configured, testRecipient: "me@b.ca" })).toEqual({
      kind: "send",
      to: "me@b.ca",
      redirectedFrom: "real@gmail.com",
    });
    expect(resolveDelivery("real@gmail.com", { ...configured, testRecipient: "me@b.ca", liveSending: "true" })).toMatchObject({ to: "me@b.ca" });
  });

  it("never reaches a real recipient unless live sending is exactly on", () => {
    expect(resolveDelivery("real@gmail.com", configured)).toEqual({ kind: "refuse", reason: "LIVE_SENDING_OFF" });
    expect(resolveDelivery("real@gmail.com", { ...configured, liveSending: "yes" })).toEqual({ kind: "refuse", reason: "LIVE_SENDING_OFF" });
    expect(resolveDelivery("real@gmail.com", { ...configured, liveSending: "true" })).toEqual({ kind: "send", to: "real@gmail.com" });
  });

  it("refuses without a key or sender", () => {
    expect(resolveDelivery("real@gmail.com", { from: "a@b.ca", liveSending: "true" })).toMatchObject({ reason: "NOT_CONFIGURED" });
    expect(resolveDelivery("real@gmail.com", { apiKey: "re_x", testRecipient: "me@b.ca" })).toMatchObject({ reason: "NOT_CONFIGURED" });
  });

  it("drops reserved test addresses in every mode", () => {
    for (const to of ["a@example.com", "A@EXAMPLE.ORG", "a@example.net", "a@shop.test", "a@x.invalid", "a@x.example", "a@x.localhost"]) {
      expect(resolveDelivery(to, { ...configured, liveSending: "true" })).toEqual({ kind: "suppress" });
      expect(resolveDelivery(to, { ...configured, testRecipient: "me@b.ca" })).toEqual({ kind: "suppress" });
    }
  });

  it("does not mistake a real domain for a reserved one", () => {
    for (const to of ["a@myexample.com", "a@example.com.ng", "a@test.ca"]) {
      expect(resolveDelivery(to, { ...configured, liveSending: "true" })).toEqual({ kind: "send", to });
    }
  });
});

describe("isRetriableStatus", () => {
  it("retries temporary and settings problems, but not a bad request", () => {
    for (const status of [401, 403, 429, 500, 503]) expect(isRetriableStatus(status)).toBe(true);
    for (const status of [400, 404, 422]) expect(isRetriableStatus(status)).toBe(false);
  });
});
