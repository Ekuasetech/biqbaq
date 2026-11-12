import { fill, NO_CUSTOM, pick, type EmailCustom, type EmailField } from "@/modules/notifications/custom";
import { defaultSiteUrl, emailLayout, emailParagraph, emailSmall } from "@/modules/notifications/layout";
import { escapeHtml, type RenderedEmail } from "@/modules/notifications/templates";
import { formatMoney, type StoredInvoice } from "./index";

// The email a client receives with the PDF attached. A record of a sale is not marketing,
// so it needs no consent or unsubscribe (CASL), but it still says who sent it and where they are.

// The built-in wording, with the {placeholders} Super Admin's editor offers.
const WORDING = {
  invoice_email: {
    en: { body: "{sender} has sent you invoice {number}, for {total}. It is attached as a PDF.", note: "If you have questions, please contact {sender} directly." },
    fr: { body: "{sender} vous a envoyé la facture {number}, d'un montant de {total}. Elle est jointe en PDF.", note: "Pour toute question, contactez directement {sender}." },
  },
  receipt_email: {
    en: { body: "{sender} has sent you receipt {number} for your payment of {total}. It is attached as a PDF.", note: "If you have questions, please contact {sender} directly." },
    fr: { body: "{sender} vous a envoyé le reçu {number} pour votre paiement de {total}. Il est joint en PDF.", note: "Pour toute question, contactez directement {sender}." },
  },
} as const;

export const INVOICE_TEMPLATES = Object.keys(WORDING);
export const INVOICE_PLACEHOLDERS = ["sender", "number", "total"];
export function invoiceDefaults(template: string): Record<"en" | "fr", Partial<Record<EmailField, string>>> | null {
  return Object.hasOwn(WORDING, template) ? { ...WORDING[template as keyof typeof WORDING] } : null;
}

export function renderInvoiceEmail(invoice: StoredInvoice, locale: string, custom: EmailCustom = NO_CUSTOM): RenderedEmail {
  const fr = locale === "fr";
  const total = formatMoney(invoice.total_minor, fr ? "fr" : "en");
  const isInvoice = invoice.kind === "invoice";
  const subject = fr
    ? `${isInvoice ? "Facture" : "Reçu"} ${invoice.label} de ${invoice.sender_name}`
    : `${isInvoice ? "Invoice" : "Receipt"} ${invoice.label} from ${invoice.sender_name}`;
  const greeting = fr ? `Bonjour ${invoice.client_name},` : `Hello ${invoice.client_name},`;
  const template = isInvoice ? "invoice_email" : "receipt_email";
  const language = fr ? "fr" : "en";
  const values = { sender: invoice.sender_name, number: invoice.label, total };
  const body = fill(pick(custom, template, language, "body", WORDING[template][language].body), values);
  const questions = fill(pick(custom, template, language, "note", WORDING[template][language].note), values);
  const footer = [fr ? `Envoyé par ${invoice.sender_name} par Biqbaq.` : `Sent by ${invoice.sender_name} through Biqbaq.`, invoice.sender_address];
  return {
    subject,
    text: [greeting, body, questions, "—", ...footer].join("\n\n"),
    html: emailLayout({
      locale: fr ? "fr" : "en",
      siteUrl: defaultSiteUrl(),
      preheader: escapeHtml(body),
      content: [
        emailParagraph(escapeHtml(greeting)),
        emailParagraph(escapeHtml(body)),
        emailParagraph(escapeHtml(questions)),
        '<hr style="border:none;border-top:1px solid #e6e1d8;margin:22px 0 16px">',
        ...footer.map((line) => emailSmall(escapeHtml(line))),
      ].join(""),
    }),
  };
}
