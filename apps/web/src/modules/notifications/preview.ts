import "server-only";
import type { StoredInvoice } from "@/modules/invoicing";
import { renderInvoiceEmail } from "@/modules/invoicing/email";
import { renderEnquiryEmail } from "@/modules/seller-contact/server";
import { buildAuthEmails } from "./auth-emails";
import type { EmailCustom } from "./custom";
import { renderListEmail } from "./list-emails";
import { renderEmail, type EmailLocale, type RenderedEmail } from "./templates";

/** One email, made with sample details, so Super Admin sees their wording in place. */
export function previewEmail(template: string, locale: EmailLocale, siteUrl: string, custom: EmailCustom): RenderedEmail | null {
  if (template.startsWith("auth_")) {
    const type = template.slice("auth_".length);
    const emails = buildAuthEmails(
      {
        user: { email: "ada@example.com", new_email: "ada.new@example.com", user_metadata: { name: "Ada", locale } },
        email_data: { email_action_type: type, token: "123456", token_hash: "sample", token_new: "", token_hash_new: "", redirect_to: "" },
      },
      siteUrl,
      custom,
    );
    return emails[0]?.email ?? null;
  }
  if (template === "list_confirm") {
    return renderListEmail("list_confirm", { shop: "Ada's Shop", token: "0".repeat(64), locale }, siteUrl, custom)?.email ?? null;
  }
  if (template === "blog_post") {
    return (
      renderListEmail(
        "blog_post",
        {
          shop: "Biqbaq",
          subject: locale === "fr" ? "Expédier une voiture à Lagos : ce qu'il faut savoir" : "Shipping a car to Lagos: what to know",
          body: locale === "fr" ? "Les coûts, les délais et les papiers à préparer avant le départ." : "What it costs, how long it takes, and the papers to get ready before it leaves.",
          slug: "shipping-a-car-to-lagos",
          cover: `${siteUrl.replace(/\/$/, "")}/hero/sienna-cargo.jpg`,
          address: "12 King St W, Toronto ON M5H 1A1",
          token: "0".repeat(64),
          source: "self",
          locale,
        },
        siteUrl,
        custom,
      )?.email ?? null
    );
  }
  if (template === "invoice_email" || template === "receipt_email") {
    const invoice = {
      kind: template === "invoice_email" ? "invoice" : "receipt",
      label: "INV-0001",
      client_name: "Bola",
      total_minor: 4500,
      sender_name: "Ada's Shop",
      sender_address: "12 King St W, Toronto ON",
    } as StoredInvoice;
    return renderInvoiceEmail(invoice, locale, custom);
  }
  if (template === "enquiry") {
    return renderEnquiryEmail(
      { name: "Bola", email: "bola@example.com", subject: "Is this in stock?", message: "Hello, is this still available?" },
      { name: "Suya Spice Blend", slug: "suya-spice-blend" },
      locale,
      siteUrl,
      custom,
    );
  }
  return renderEmail(
    template,
    { role: "seller", shop: "Ada's Shop", product: "Suya Spice Blend", reason: "An example reason" },
    { name: "Ada", locale },
    siteUrl,
    custom,
  );
}
