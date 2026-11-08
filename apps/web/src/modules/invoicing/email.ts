import { escapeHtml, type RenderedEmail } from "@/modules/notifications/templates";
import { formatMoney, type StoredInvoice } from "./index";

// The email a client receives with the PDF attached. A record of a sale is not marketing,
// so it needs no consent or unsubscribe (CASL), but it still says who sent it and where they are.

export function renderInvoiceEmail(invoice: StoredInvoice, locale: string): RenderedEmail {
  const fr = locale === "fr";
  const total = formatMoney(invoice.total_minor, fr ? "fr" : "en");
  const isInvoice = invoice.kind === "invoice";
  const subject = fr
    ? `${isInvoice ? "Facture" : "Reçu"} ${invoice.label} de ${invoice.sender_name}`
    : `${isInvoice ? "Invoice" : "Receipt"} ${invoice.label} from ${invoice.sender_name}`;
  const greeting = fr ? `Bonjour ${invoice.client_name},` : `Hello ${invoice.client_name},`;
  const body = fr
    ? isInvoice
      ? `${invoice.sender_name} vous a envoyé la facture ${invoice.label}, d'un montant de ${total}. Elle est jointe en PDF.`
      : `${invoice.sender_name} vous a envoyé le reçu ${invoice.label} pour votre paiement de ${total}. Il est joint en PDF.`
    : isInvoice
      ? `${invoice.sender_name} has sent you invoice ${invoice.label}, for ${total}. It is attached as a PDF.`
      : `${invoice.sender_name} has sent you receipt ${invoice.label} for your payment of ${total}. It is attached as a PDF.`;
  const questions = fr
    ? `Pour toute question, contactez directement ${invoice.sender_name}.`
    : `If you have questions, please contact ${invoice.sender_name} directly.`;
  const footer = [fr ? `Envoyé par ${invoice.sender_name} par Biqbaq.` : `Sent by ${invoice.sender_name} through Biqbaq.`, invoice.sender_address];
  return {
    subject,
    text: [greeting, body, questions, "—", ...footer].join("\n\n"),
    html: [
      `<p>${escapeHtml(greeting)}</p>`,
      `<p>${escapeHtml(body)}</p>`,
      `<p>${escapeHtml(questions)}</p>`,
      '<hr style="border:none;border-top:1px solid #ddd">',
      ...footer.map((line) => `<p style="font-size:12px;color:#666">${escapeHtml(line)}</p>`),
    ].join(""),
  };
}
