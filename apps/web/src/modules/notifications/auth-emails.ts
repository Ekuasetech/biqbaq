import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { escapeHtml, type EmailLocale, type RenderedEmail } from "./templates";

const TOLERANCE_SECONDS = 5 * 60;

/** Checks that a request really came from Supabase Auth, using the Standard Webhooks scheme. */
export function isValidHookSignature(
  secret: string,
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!secret.startsWith("v1,whsec_") || !headers.id || !headers.timestamp || !headers.signature) return false;
  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.slice("v1,whsec_".length), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest();
  return headers.signature.split(" ").some((candidate) => {
    const [version, value] = candidate.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export const hookPayloadSchema = z.object({
  user: z.object({
    email: z.string(),
    new_email: z.string().optional(),
    user_metadata: z.object({ full_name: z.unknown(), name: z.unknown(), locale: z.unknown() }).partial().nullish(),
  }),
  email_data: z.object({
    token: z.string().optional().default(""),
    token_hash: z.string().optional().default(""),
    token_new: z.string().optional().default(""),
    token_hash_new: z.string().optional().default(""),
    redirect_to: z.string().optional().default(""),
    email_action_type: z.string(),
  }),
});
export type HookPayload = z.infer<typeof hookPayloadSchema>;

interface Copy {
  subject: string;
  intro: string;
  action?: string;
  ignore: string;
}

const AUTH_COPY: Record<string, Record<EmailLocale, Copy>> = {
  signup: {
    en: {
      subject: "Confirm your Biqbaq account",
      intro: "Thanks for creating a Biqbaq account. Please confirm your email address to finish.",
      action: "Confirm my account",
      ignore: "If you did not create this account, you can ignore this email.",
    },
    fr: {
      subject: "Confirmez votre compte Biqbaq",
      intro: "Merci d'avoir créé un compte Biqbaq. Veuillez confirmer votre adresse courriel pour terminer.",
      action: "Confirmer mon compte",
      ignore: "Si vous n'avez pas créé ce compte, vous pouvez ignorer ce courriel.",
    },
  },
  recovery: {
    en: {
      subject: "Reset your Biqbaq password",
      intro: "We received a request to reset your Biqbaq password.",
      action: "Reset my password",
      ignore: "If you did not ask for this, you can ignore this email, and your password stays the same.",
    },
    fr: {
      subject: "Réinitialisez votre mot de passe Biqbaq",
      intro: "Nous avons reçu une demande de réinitialisation de votre mot de passe Biqbaq.",
      action: "Réinitialiser mon mot de passe",
      ignore: "Si vous n'avez rien demandé, vous pouvez ignorer ce courriel : votre mot de passe reste le même.",
    },
  },
  magiclink: {
    en: {
      subject: "Your Biqbaq sign-in link",
      intro: "Use this link to sign in to Biqbaq.",
      action: "Sign in",
      ignore: "If you did not ask for this, you can ignore this email.",
    },
    fr: {
      subject: "Votre lien de connexion Biqbaq",
      intro: "Utilisez ce lien pour vous connecter à Biqbaq.",
      action: "Me connecter",
      ignore: "Si vous n'avez rien demandé, vous pouvez ignorer ce courriel.",
    },
  },
  invite: {
    en: {
      subject: "You are invited to Biqbaq",
      intro: "You have been invited to create a Biqbaq account.",
      action: "Accept the invitation",
      ignore: "If you were not expecting this, you can ignore this email.",
    },
    fr: {
      subject: "Vous êtes invité sur Biqbaq",
      intro: "Vous avez été invité à créer un compte Biqbaq.",
      action: "Accepter l'invitation",
      ignore: "Si vous ne vous y attendiez pas, vous pouvez ignorer ce courriel.",
    },
  },
  email_change: {
    en: {
      subject: "Confirm your new Biqbaq email address",
      intro: "We received a request to change the email address on your Biqbaq account.",
      action: "Confirm the change",
      ignore: "If you did not ask for this, please change your password.",
    },
    fr: {
      subject: "Confirmez votre nouvelle adresse courriel Biqbaq",
      intro: "Nous avons reçu une demande de changement de l'adresse courriel de votre compte Biqbaq.",
      action: "Confirmer le changement",
      ignore: "Si vous n'avez rien demandé, veuillez changer votre mot de passe.",
    },
  },
  reauthentication: {
    en: {
      subject: "Your Biqbaq confirmation code",
      intro: "Enter this code to confirm it is you.",
      ignore: "If you did not ask for this, please change your password.",
    },
    fr: {
      subject: "Votre code de confirmation Biqbaq",
      intro: "Saisissez ce code pour confirmer votre identité.",
      ignore: "Si vous n'avez rien demandé, veuillez changer votre mot de passe.",
    },
  },
};

const EXPIRY: Record<EmailLocale, string> = {
  en: "This only works for a limited time.",
  fr: "Ceci n'est valable que pendant une durée limitée.",
};

function render(copy: Copy, locale: EmailLocale, name: string | null, link: string | null, code: string): RenderedEmail {
  const greeting = locale === "fr" ? (name ? `Bonjour ${name},` : "Bonjour,") : name ? `Hello ${name},` : "Hello,";
  const text = [greeting, copy.intro, link ? `${copy.action}: ${link}` : code, EXPIRY[locale], copy.ignore, "Biqbaq"].join("\n\n");
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(copy.intro)}</p>`,
    link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(copy.action ?? "")}</a></p>` : `<p><strong>${escapeHtml(code)}</strong></p>`,
    `<p>${escapeHtml(EXPIRY[locale])}</p>`,
    `<p>${escapeHtml(copy.ignore)}</p>`,
    "<p>Biqbaq</p>",
  ].join("");
  return { subject: copy.subject, text, html };
}

function verifyLink(apiUrl: string, tokenHash: string, type: string, redirectTo: string) {
  const query = new URLSearchParams({ token: tokenHash, type });
  if (redirectTo) query.set("redirect_to", redirectTo);
  return `${apiUrl.replace(/\/$/, "")}/auth/v1/verify?${query}`;
}

/**
 * Turns one request from Supabase Auth into the emails it needs. An empty list means a type
 * Biqbaq does not send, such as a security notice, which are all off by default.
 */
export function buildAuthEmails(payload: HookPayload, apiUrl: string): { to: string; email: RenderedEmail }[] {
  const { user, email_data: data } = payload;
  const type = data.email_action_type === "email" ? "reauthentication" : data.email_action_type;
  const versions = Object.hasOwn(AUTH_COPY, type) ? AUTH_COPY[type] : undefined;
  if (!versions) return [];

  const locale: EmailLocale = user.user_metadata?.locale === "fr" ? "fr" : "en";
  const rawName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : null;
  const copy = versions[locale];

  if (type === "reauthentication") return [{ to: user.email, email: render(copy, locale, name, null, data.token) }];

  if (type === "email_change") {
    // Supabase's two hash names are the reverse of what they suggest: `token_hash_new`
    // belongs to the current address, and `token_hash` to the new one.
    const link = (hash: string) => verifyLink(apiUrl, hash, type, data.redirect_to);
    const emails = [];
    if (user.new_email && data.token_hash) emails.push({ to: user.new_email, email: render(copy, locale, name, link(data.token_hash), "") });
    if (data.token_hash_new) emails.push({ to: user.email, email: render(copy, locale, name, link(data.token_hash_new), "") });
    return emails;
  }

  return [{ to: user.email, email: render(copy, locale, name, verifyLink(apiUrl, data.token_hash, type, data.redirect_to), "") }];
}
