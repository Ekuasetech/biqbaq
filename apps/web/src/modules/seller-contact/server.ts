import { createHmac } from "node:crypto";
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

export function renderEnquiryEmail(
  enquiry: ContactEnquiry,
  product: { name: string; slug: string; kind?: "product" | "vehicle" },
  sellerLocale: string,
  siteUrl: string,
): RenderedEmail {
  const locale: EmailLocale = sellerLocale === "fr" ? "fr" : "en";
  const copy = COPY[locale];
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
  const html = [
    `<p>${escapeHtml(copy.intro)}</p>`,
    `<p><strong>${escapeHtml(copy.product)}:</strong> <a href="${escapeHtml(link)}">${escapeHtml(product.name)}</a></p>`,
    `<p><strong>${escapeHtml(copy.from)}:</strong> ${escapeHtml(enquiry.name)} (${escapeHtml(enquiry.email)})</p>`,
    `<p><strong>${escapeHtml(enquiry.subject)}</strong></p>`,
    `<p style="white-space:pre-wrap">${escapeHtml(enquiry.message)}</p>`,
    `<p><em>${escapeHtml(copy.reply)}</em></p>`,
  ].join("");
  return { subject: `${copy.subject}: ${enquiry.subject}`, text, html };
}
