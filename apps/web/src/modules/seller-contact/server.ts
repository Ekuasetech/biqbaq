import { createHmac } from "node:crypto";
import { NO_CUSTOM, pick, type EmailCustom, type EmailField } from "@/modules/notifications/custom";
import { emailLayout, emailParagraph } from "@/modules/notifications/layout";
import { escapeHtml, type EmailLocale, type RenderedEmail } from "@/modules/notifications/templates";
import type { ContactEnquiry } from "./schema";

/** Stored instead of the address itself, so the log cannot be read back into a contact list. */
export const hashForLog = (secret: string, value: string) => createHmac("sha256", secret).update(value.trim().toLowerCase()).digest("hex");

/**
 * The visitor's address, for rate limits. A proxy adds the address it saw to the end of
 * x-forwarded-for, so the last entry is the one a visitor cannot make up.
 */
export function clientAddress(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
}

const COPY: Record<EmailLocale, { intro: string; from: string; product: string; message: string; reply: string; view: string; subject: string }> = {
  en: {
    subject: "Biqbaq enquiry",
    intro: "You have a new enquiry from a visitor to your Biqbaq shop.",
    from: "From",
    product: "Product",
    message: "Message",
    reply: "Replying to this email goes straight to the visitor, and shows them your email address.",
    view: "View the product",
  },
  fr: {
    subject: "Demande Biqbaq",
    intro: "Vous avez une nouvelle demande d'un visiteur de votre boutique Biqbaq.",
    from: "De",
    product: "Produit",
    message: "Message",
    reply: "Répondre à ce courriel écrit directement au visiteur et lui montre votre adresse courriel.",
    view: "Voir le produit",
  },
};

export function enquiryDefaults(): Record<EmailLocale, Partial<Record<EmailField, string>>> {
  return { en: { body: COPY.en.intro, note: COPY.en.reply }, fr: { body: COPY.fr.intro, note: COPY.fr.reply } };
}

export function renderEnquiryEmail(
  enquiry: ContactEnquiry,
  product: { name: string; slug: string; kind?: "product" | "vehicle" },
  sellerLocale: string,
  siteUrl: string,
  custom: EmailCustom = NO_CUSTOM,
): RenderedEmail {
  const locale: EmailLocale = sellerLocale === "fr" ? "fr" : "en";
  const copy = {
    ...COPY[locale],
    intro: pick(custom, "enquiry", locale, "body", COPY[locale].intro),
    reply: pick(custom, "enquiry", locale, "note", COPY[locale].reply),
  };
  const section = product.kind === "vehicle" ? "cargo-cars" : "products";
  const link = `${siteUrl.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}/${section}/${encodeURIComponent(product.slug)}`;
  const text = [
    copy.intro,
    `${copy.product}: ${product.name}\n${copy.view}: ${link}`,
    `${copy.from}: ${enquiry.name} <${enquiry.email}>`,
    enquiry.subject,
    `${copy.message}:\n${enquiry.message}`,
    copy.reply,
  ].join("\n\n");
  // Everything here but our own wording was typed by a stranger, so none of it can become markup.
  const html = emailLayout({
    locale,
    siteUrl,
    preheader: escapeHtml(copy.intro),
    content: [
      emailParagraph(escapeHtml(copy.intro)),
      emailParagraph(`<strong>${escapeHtml(copy.product)}:</strong> <a href="${escapeHtml(link)}" style="color:#d01d21">${escapeHtml(product.name)}</a>`),
      emailParagraph(`<strong>${escapeHtml(copy.from)}:</strong> ${escapeHtml(enquiry.name)} (${escapeHtml(enquiry.email)})`),
      emailParagraph(`<strong>${escapeHtml(enquiry.subject)}</strong>`),
      emailParagraph(escapeHtml(enquiry.message), "white-space:pre-wrap"),
      emailParagraph(`<em>${escapeHtml(copy.reply)}</em>`, "color:#5b6475"),
    ].join(""),
  });
  return { subject: `${copy.subject}: ${enquiry.subject}`, text, html };
}
