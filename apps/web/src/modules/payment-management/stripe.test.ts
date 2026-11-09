import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { formEncode, isValidStripeSignature, readiness } = await import("./stripe");

const secret = "whsec_test_secret";
const sign = (payload: string, t: number, key = secret) => `t=${t},v1=${createHmac("sha256", key).update(`${t}.${payload}`).digest("hex")}`;

describe("Stripe notices", () => {
  const now = 1_800_000_000;
  const payload = '{"id":"evt_1"}';
  it("are accepted only with Stripe's signature, recently made", () => {
    expect(isValidStripeSignature(payload, sign(payload, now), secret, now)).toBe(true);
    expect(isValidStripeSignature(payload, sign(payload, now, "whsec_other"), secret, now)).toBe(false);
    expect(isValidStripeSignature(`${payload} `, sign(payload, now), secret, now)).toBe(false);
    expect(isValidStripeSignature(payload, sign(payload, now - 600), secret, now)).toBe(false);
    expect(isValidStripeSignature(payload, null, secret, now)).toBe(false);
    expect(isValidStripeSignature(payload, "t=1,v1=zz", secret, now)).toBe(false);
  });
});

describe("Stripe's form encoding", () => {
  it("writes nested keys the way Stripe reads them", () => {
    const encoded = formEncode({ line_items: [{ quantity: 2, price_data: { currency: "cad" } }], phone_number_collection: { enabled: true }, skip: undefined });
    expect(decodeURIComponent(encoded.toString())).toBe("line_items[0][quantity]=2&line_items[0][price_data][currency]=cad&phone_number_collection[enabled]=true");
  });
});

describe("a seller's readiness", () => {
  const account = (card: string, payouts: string, entries: unknown[]) => ({
    id: "acct_1",
    configuration: { merchant: { capabilities: { card_payments: { status: card }, stripe_balance: { payouts: { status: payouts } } } } },
    requirements: { entries },
  });
  it("is enabled only when Stripe says both payments and payouts are active", () => {
    expect(readiness(account("active", "active", []))).toEqual({ chargesEnabled: true, payoutsEnabled: true, requirementsDue: 0, restricted: false });
    expect(readiness(account("active", "pending", []))).toMatchObject({ payoutsEnabled: false });
  });
  it("tells missing details apart from a restriction", () => {
    expect(readiness(account("restricted", "restricted", [{}, {}]))).toMatchObject({ requirementsDue: 2, restricted: false });
    expect(readiness(account("restricted", "active", []))).toMatchObject({ restricted: true });
  });
  it("copes with what Stripe leaves out", () => {
    expect(readiness({ id: "acct_1" })).toEqual({ chargesEnabled: false, payoutsEnabled: false, requirementsDue: 0, restricted: false });
  });
});
