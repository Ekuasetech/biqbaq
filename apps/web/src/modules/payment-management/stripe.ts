import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The Stripe connector (BD-12). Server only: the secret key never reaches a browser (§13.4).
// Plain HTTPS calls, so Biqbaq is not tied to one library's support for Stripe's preview
// version. Sellers are Accounts v2 with the Express dashboard and Stripe responsible for
// losses (Managed Risk), which Stripe offers as a public preview, hence its version below.

const API = "https://api.stripe.com";
/** Needed for the Express dashboard with Stripe responsible for losses. Recheck before launch. */
export const STRIPE_V2_VERSION = "2026-10-28.preview";

export class StripeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Stripe ${status} ${code}`);
  }
}

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !/^(sk|rk)_(test|live)_/.test(key)) throw new StripeError(0, "NOT_CONFIGURED");
  return key;
}

export const stripeConfigured = () => {
  try {
    secretKey();
    return true;
  } catch {
    return false;
  }
};

/** Stripe's form encoding for v1, with nested keys like line_items[0][quantity]. */
export function formEncode(value: unknown, prefix = "", out = new URLSearchParams()): URLSearchParams {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) value.forEach((item, index) => formEncode(item, `${prefix}[${index}]`, out));
  else if (typeof value === "object") for (const [key, inner] of Object.entries(value)) formEncode(inner, prefix ? `${prefix}[${key}]` : key, out);
  else out.append(prefix, String(value));
  return out;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  options: { body?: unknown; v2?: boolean; account?: string; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey()}`, "User-Agent": "biqbaq" };
  if (options.account) headers["Stripe-Account"] = options.account;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
  let body: string | undefined;
  if (options.v2) {
    headers["Stripe-Version"] = STRIPE_V2_VERSION;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = formEncode(options.body).toString();
  }
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { method, headers, body, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new StripeError(0, "UNREACHABLE");
  }
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    // Only Stripe's short error code is kept: its messages can repeat personal details.
    const error = (data?.error ?? {}) as { code?: unknown; type?: unknown };
    const code = typeof error.code === "string" ? error.code : typeof error.type === "string" ? error.type : "unknown";
    throw new StripeError(response.status, code.replace(/[^a-z0-9_]/gi, "").slice(0, 80));
  }
  return data as T;
}

// Sellers' accounts.

interface V2Account {
  id: string;
  configuration?: {
    merchant?: { capabilities?: { card_payments?: { status?: string }; stripe_balance?: { payouts?: { status?: string } } } } | null;
  } | null;
  requirements?: { entries?: unknown[] | null } | null;
}

export interface AccountReadiness {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: number;
  /** Stripe has limited the account for a reason other than missing details. */
  restricted: boolean;
}

/** What a seller's account can do, from Stripe's own answer (§13.3). */
export function readiness(account: V2Account): AccountReadiness {
  const capabilities = account.configuration?.merchant?.capabilities;
  const card = capabilities?.card_payments?.status;
  const payouts = capabilities?.stripe_balance?.payouts?.status;
  const requirementsDue = account.requirements?.entries?.length ?? 0;
  return {
    chargesEnabled: card === "active",
    payoutsEnabled: payouts === "active",
    requirementsDue,
    restricted: card === "restricted" && requirementsDue === 0,
  };
}

export function createSellerAccount(input: { sellerId: string; email: string | null; shopName: string }) {
  return request<V2Account>("POST", "/v2/core/accounts", {
    v2: true,
    idempotencyKey: `account:${input.sellerId}`,
    body: {
      contact_email: input.email ?? undefined,
      display_name: input.shopName.slice(0, 100),
      dashboard: "express",
      identity: { country: "ca" },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      defaults: { currency: "cad", locales: ["en-CA"], responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
      metadata: { biqbaq_seller: input.sellerId },
      include: ["configuration.merchant", "requirements"],
    },
  });
}

export const getSellerAccount = (accountId: string) =>
  request<V2Account>("GET", `/v2/core/accounts/${encodeURIComponent(accountId)}?include=configuration.merchant&include=requirements`, { v2: true });

export async function onboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
  const link = await request<{ url: string }>("POST", "/v2/core/account_links", {
    v2: true,
    body: {
      account: accountId,
      // Stripe works out the configurations to collect for from the account itself.
      use_case: { type: "account_onboarding", account_onboarding: { return_url: returnUrl, refresh_url: refreshUrl } },
    },
  });
  return link.url;
}

/** A one-time link into the seller's Express dashboard, for payouts, refunds and disputes. */
export async function dashboardLink(accountId: string) {
  const link = await request<{ url: string }>("POST", `/v1/accounts/${encodeURIComponent(accountId)}/login_links`, { body: {} });
  return link.url;
}

// Payments: direct charges on the seller's account, with Biqbaq's fee (BD-02).

export async function createCheckout(input: {
  accountId: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  unitPriceMinor: number;
  quantity: number;
  applicationFeeMinor: number;
  buyerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  locale: "en" | "fr";
}) {
  const session = await request<{ id: string; url: string }>("POST", "/v1/checkout/sessions", {
    account: input.accountId,
    idempotencyKey: `checkout:${input.orderId}`,
    body: {
      mode: "payment",
      locale: input.locale === "fr" ? "fr-CA" : "en",
      line_items: [{ quantity: input.quantity, price_data: { currency: "cad", unit_amount: input.unitPriceMinor, product_data: { name: input.productName.slice(0, 250) } } }],
      payment_intent_data: { application_fee_amount: input.applicationFeeMinor, metadata: { biqbaq_order: input.orderId, biqbaq_number: input.orderNumber } },
      // BD-03: the seller arranges delivery, so Stripe collects where and how to reach the buyer.
      shipping_address_collection: { allowed_countries: ["CA"] },
      phone_number_collection: { enabled: true },
      customer_email: input.buyerEmail ?? undefined,
      client_reference_id: input.orderId,
      metadata: { biqbaq_order: input.orderId, biqbaq_number: input.orderNumber },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
  });
  return session;
}

/** A refund from the seller's balance. Biqbaq's fee is kept (BD-02). */
export function createRefund(input: { accountId: string; paymentId: string; amountMinor: number; key: string }) {
  return request<{ id: string; status: string; amount: number }>("POST", "/v1/refunds", {
    account: input.accountId,
    idempotencyKey: input.key,
    body: { payment_intent: input.paymentId, amount: input.amountMinor, refund_application_fee: false, metadata: { biqbaq: "seller_refund" } },
  });
}

// Notices from Stripe.

const TOLERANCE_SECONDS = 5 * 60;

/** Checks Stripe's signature on a notice ("t=…,v1=…"), within five minutes. */
export function isValidStripeSignature(payload: string, header: string | null, secret: string, nowSeconds = Date.now() / 1000): boolean {
  if (!header || !secret.startsWith("whsec_")) return false;
  const parts = header.split(",").map((part) => part.split("=") as [string, string]);
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return parts
    .filter(([key]) => key === "v1")
    .some(([, value]) => {
      const given = Buffer.from(value ?? "", "hex");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
