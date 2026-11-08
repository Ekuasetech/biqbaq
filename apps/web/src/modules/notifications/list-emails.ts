import { escapeHtml, type RenderedEmail } from "./templates";

// Customer list emails (Q-42 to Q-46). Canada's anti-spam law and Resend both need each
// one to say who sent it and why, give the sender's mailing address, and unsubscribe in one step.

export interface ListEmailData {
  shop?: unknown;
  subject?: unknown;
  body?: unknown;
  address?: unknown;
  token?: unknown;
  source?: unknown;
  locale?: unknown;
}

export interface ListEmail {
  email: RenderedEmail;
  /** One-click unsubscribe for mail apps (RFC 8058). */
  headers?: Record<string, string>;
}

export const LIST_TEMPLATES = ["list_confirm", "bulk_email"] as const;
export const isListTemplate = (template: string) => (LIST_TEMPLATES as readonly string[]).includes(template);

const TOKEN = /^[0-9a-f]{64}$/;
const text = (value: unknown) => (typeof value === "string" ? value : "");

const COPY = {
  en: {
    confirmSubject: (shop: string) => `Confirm you want emails from ${shop}`,
    confirmBody: (shop: string) =>
      `${shop} would like to send you occasional emails through Biqbaq, and says you agreed to this. Please confirm, or ignore this email and you won't hear from them.`,
    confirmAction: "Yes, send me their emails",
    confirmNote: "If you didn't expect this, you can ignore it. You will not be added.",
    why: (shop: string, source: string) =>
      source === "self"
        ? `You're getting this because you chose to get updates from ${shop} on Biqbaq.`
        : source === "customer"
          ? `You're getting this because you're a customer of ${shop}.`
          : `You're getting this because you agreed to hear from ${shop}, and confirmed it.`,
    from: (shop: string) => `Sent by ${shop} through Biqbaq.`,
    address: "Mailing address",
    unsubscribe: "Unsubscribe",
  },
  fr: {
    confirmSubject: (shop: string) => `Confirmez que vous voulez des courriels de ${shop}`,
    confirmBody: (shop: string) =>
      `${shop} aimerait vous envoyer des courriels de temps en temps par Biqbaq, et indique que vous avez accepté. Veuillez confirmer, ou ignorez ce courriel et vous n'en recevrez pas.`,
    confirmAction: "Oui, envoyez-moi leurs courriels",
    confirmNote: "Si vous ne vous y attendiez pas, ignorez ce courriel. Vous ne serez pas ajouté.",
    why: (shop: string, source: string) =>
      source === "self"
        ? `Vous recevez ceci parce que vous avez choisi de recevoir des nouvelles de ${shop} sur Biqbaq.`
        : source === "customer"
          ? `Vous recevez ceci parce que vous êtes client de ${shop}.`
          : `Vous recevez ceci parce que vous avez accepté d'avoir des nouvelles de ${shop}, et l'avez confirmé.`,
    from: (shop: string) => `Envoyé par ${shop} par Biqbaq.`,
    address: "Adresse postale",
    unsubscribe: "Se désabonner",
  },
};

const page = (siteUrl: string, locale: "en" | "fr", path: string, token: string) =>
  `${siteUrl.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}${path}?t=${token}`;

/** Null when the job's data is not complete, so nothing half-made is ever sent. */
export function renderListEmail(template: string, data: ListEmailData, siteUrl: string): ListEmail | null {
  const locale = data.locale === "fr" ? "fr" : "en";
  const copy = COPY[locale];
  const shop = text(data.shop);
  const token = text(data.token);
  if (!shop || !TOKEN.test(token)) return null;

  if (template === "list_confirm") {
    const link = page(siteUrl, locale, "/email/confirm", token);
    return {
      email: {
        subject: copy.confirmSubject(shop),
        text: [copy.confirmBody(shop), `${copy.confirmAction}: ${link}`, copy.confirmNote, "Biqbaq"].join("\n\n"),
        html: [
          `<p>${escapeHtml(copy.confirmBody(shop))}</p>`,
          `<p><a href="${escapeHtml(link)}">${escapeHtml(copy.confirmAction)}</a></p>`,
          `<p>${escapeHtml(copy.confirmNote)}</p>`,
          "<p>Biqbaq</p>",
        ].join(""),
      },
    };
  }

  if (template === "bulk_email") {
    const subject = text(data.subject);
    const body = text(data.body);
    const address = text(data.address);
    if (!subject || !body || !address) return null;
    const unsubscribe = page(siteUrl, locale, "/email/unsubscribe", token);
    const oneClick = `${siteUrl.replace(/\/$/, "")}/api/v1/email/unsubscribe?t=${token}`;
    const footer = [copy.from(shop), copy.why(shop, text(data.source)), `${copy.address}: ${address}`];
    // What the shop wrote is shown exactly as typed: nothing in it can become markup.
    const paragraphs = body.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br>")}</p>`);
    return {
      email: {
        subject,
        text: [body, "—", ...footer, `${copy.unsubscribe}: ${unsubscribe}`].join("\n\n"),
        html: [
          ...paragraphs,
          '<hr style="border:none;border-top:1px solid #ddd">',
          ...footer.map((line) => `<p style="font-size:12px;color:#666">${escapeHtml(line)}</p>`),
          `<p style="font-size:12px"><a href="${escapeHtml(unsubscribe)}">${escapeHtml(copy.unsubscribe)}</a></p>`,
        ].join(""),
      },
      headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    };
  }
  return null;
}
