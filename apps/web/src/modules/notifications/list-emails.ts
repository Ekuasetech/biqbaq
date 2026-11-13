import { fill, NO_CUSTOM, pick, type EmailCustom, type EmailField } from "./custom";
import { emailButton, emailLayout, emailParagraph, emailSmall } from "./layout";
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
  /** A blog post's address and cover photo (Q-68). */
  slug?: unknown;
  cover?: unknown;
}

export interface ListEmail {
  email: RenderedEmail;
  /** One-click unsubscribe for mail apps (RFC 8058). */
  headers?: Record<string, string>;
}

export const LIST_TEMPLATES = ["list_confirm", "bulk_email", "blog_post"] as const;
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
    eyebrow: "New on the Biqbaq Blog",
    read: "Read the post",
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
    eyebrow: "Nouveau sur le blog Biqbaq",
    read: "Lire l'article",
  },
};

const SLUG = /^[a-z0-9-]{1,200}$/;
// Only photos stored with Biqbaq's photo service are shown.
const COVER = /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/;

const page = (siteUrl: string, locale: "en" | "fr", path: string, token: string) =>
  `${siteUrl.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}${path}?t=${token}`;

/** The confirmation's built-in wording, with {shop}, for Super Admin's editor. */
export function listConfirmDefaults(): Record<"en" | "fr", Partial<Record<EmailField, string>>> {
  const of = (locale: "en" | "fr") => ({ body: COPY[locale].confirmBody("{shop}"), action: COPY[locale].confirmAction, note: COPY[locale].confirmNote });
  return { en: of("en"), fr: of("fr") };
}

/** Null when the job's data is not complete, so nothing half-made is ever sent. */
export function renderListEmail(template: string, data: ListEmailData, siteUrl: string, custom: EmailCustom = NO_CUSTOM): ListEmail | null {
  const locale = data.locale === "fr" ? "fr" : "en";
  const copy = COPY[locale];
  const shop = text(data.shop);
  const token = text(data.token);
  if (!shop || !TOKEN.test(token)) return null;

  if (template === "list_confirm") {
    const link = page(siteUrl, locale, "/email/confirm", token);
    const body = fill(pick(custom, "list_confirm", locale, "body", copy.confirmBody("{shop}")), { shop });
    const action = pick(custom, "list_confirm", locale, "action", copy.confirmAction);
    const note = pick(custom, "list_confirm", locale, "note", copy.confirmNote);
    return {
      email: {
        subject: copy.confirmSubject(shop),
        text: [body, `${action}: ${link}`, note, "Biqbaq"].join("\n\n"),
        html: emailLayout({
          locale,
          siteUrl,
          preheader: escapeHtml(body),
          content: [
            emailParagraph(escapeHtml(body)),
            emailButton(escapeHtml(link), escapeHtml(action)),
            emailParagraph(escapeHtml(note), "color:#5b6475;font-size:13px"),
          ].join(""),
        }),
      },
    };
  }

  if (template === "blog_post") {
    // The subject is the post's title (owner's request, 2026-11-13).
    const title = text(data.subject);
    const excerpt = text(data.body);
    const slug = text(data.slug);
    const address = text(data.address);
    if (!title || !SLUG.test(slug) || !address) return null;
    const cover = COVER.test(text(data.cover)) ? text(data.cover) : null;
    const link = `${siteUrl.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}/blog/${slug}`;
    const unsubscribe = page(siteUrl, locale, "/email/unsubscribe", token);
    const oneClick = `${siteUrl.replace(/\/$/, "")}/api/v1/email/unsubscribe?t=${token}`;
    const footer = [copy.from(shop), copy.why(shop, text(data.source)), `${copy.address}: ${address}`];
    return {
      email: {
        subject: title,
        text: [copy.eyebrow, title, excerpt, `${copy.read}: ${link}`, "—", ...footer, `${copy.unsubscribe}: ${unsubscribe}`].filter(Boolean).join("\n\n"),
        html: emailLayout({
          locale,
          siteUrl,
          preheader: escapeHtml(excerpt || title),
          content: [
            cover
              ? `<a href="${escapeHtml(link)}"><img src="${escapeHtml(cover)}" alt="" width="520" style="display:block;width:100%;max-width:520px;height:auto;border-radius:14px;margin:0 0 18px"></a>`
              : "",
            emailSmall(`<strong style="color:#d01d21;letter-spacing:0.06em;text-transform:uppercase">${escapeHtml(copy.eyebrow)}</strong>`),
            `<h1 style="margin:4px 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:24px;line-height:1.25;color:#0c2352">${escapeHtml(title)}</h1>`,
            excerpt ? emailParagraph(escapeHtml(excerpt)) : "",
            emailButton(escapeHtml(link), escapeHtml(copy.read)),
            '<hr style="border:none;border-top:1px solid #e6e1d8;margin:22px 0 16px">',
            ...footer.map((line) => emailSmall(escapeHtml(line))),
            emailSmall(`<a href="${escapeHtml(unsubscribe)}" style="color:#5b6475">${escapeHtml(copy.unsubscribe)}</a>`),
          ].join(""),
        }),
      },
      headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
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
    const paragraphs = body.split(/\n{2,}/).map((part) => emailParagraph(escapeHtml(part).replaceAll("\n", "<br>")));
    return {
      email: {
        subject,
        text: [body, "—", ...footer, `${copy.unsubscribe}: ${unsubscribe}`].join("\n\n"),
        html: emailLayout({
          locale,
          siteUrl,
          content: [
            ...paragraphs,
            '<hr style="border:none;border-top:1px solid #e6e1d8;margin:22px 0 16px">',
            // Who sent it, why, their address and how to stop (CASL), as before.
            ...footer.map((line) => emailSmall(escapeHtml(line))),
            emailSmall(`<a href="${escapeHtml(unsubscribe)}" style="color:#5b6475">${escapeHtml(copy.unsubscribe)}</a>`),
          ].join(""),
        }),
      },
      headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    };
  }
  return null;
}
