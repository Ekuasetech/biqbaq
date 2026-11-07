export interface EmailEnv {
  apiKey?: string;
  from?: string;
  testRecipient?: string;
  liveSending?: string;
}

export type Delivery =
  | { kind: "send"; to: string; redirectedFrom?: string }
  | { kind: "suppress" }
  | { kind: "refuse"; reason: "NOT_CONFIGURED" | "LIVE_SENDING_OFF" };

// Addresses set aside for testing, which can never receive mail. Sending to them only
// bounces, and bounces hurt the sending domain's reputation.
const RESERVED = /@(example\.(com|org|net)|[^@]+\.(test|example|invalid|localhost))$/i;

/**
 * Decides where an email really goes. It fails safe: a real recipient is only used when
 * live sending has been switched on and no test address is set.
 */
export function resolveDelivery(to: string, env: EmailEnv): Delivery {
  if (RESERVED.test(to)) return { kind: "suppress" };
  if (!env.apiKey || !env.from) return { kind: "refuse", reason: "NOT_CONFIGURED" };
  if (env.testRecipient) return { kind: "send", to: env.testRecipient, redirectedFrom: to };
  if (env.liveSending === "true") return { kind: "send", to };
  return { kind: "refuse", reason: "LIVE_SENDING_OFF" };
}

/** Resend's temporary failures, plus login and domain problems that fixing the settings will clear. */
export const isRetriableStatus = (status: number) => status === 401 || status === 403 || status === 429 || status >= 500;
