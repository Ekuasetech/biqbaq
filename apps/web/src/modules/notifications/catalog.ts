import "server-only";
import { authDefaults, AUTH_TEMPLATES } from "./auth-emails";
import { listConfirmDefaults } from "./list-emails";
import { notificationDefaults, NOTIFICATION_TEMPLATES, type EmailLocale } from "./templates";
import { placeholdersIn, type EmailField } from "./custom";
import { INVOICE_PLACEHOLDERS, INVOICE_TEMPLATES, invoiceDefaults } from "@/modules/invoicing/email";
import { enquiryDefaults } from "@/modules/seller-contact/server";

/**
 * Every email Super Admin can reword, grouped as the editor shows them, with each one's
 * built-in wording and the {placeholders} it may use. Subjects and links are not here: they
 * stay fixed.
 */
export const EMAIL_GROUPS = ["account", "roles", "shop", "orders", "messages"] as const;
export type EmailGroup = (typeof EMAIL_GROUPS)[number];

export interface EmailEntry {
  template: string;
  group: EmailGroup;
  placeholders: string[];
  fields: EmailField[];
  defaults: Record<EmailLocale, Partial<Record<EmailField, string>>>;
}

function groupOf(template: string): EmailGroup {
  if (template === "welcome" || template.startsWith("auth_")) return "account";
  if (/^(application|role|staff|verification)_/.test(template)) return "roles";
  if (/^(payments|order)_/.test(template) || INVOICE_TEMPLATES.includes(template)) return "orders";
  if (template.startsWith("message_") || template === "enquiry") return "messages";
  return "shop";
}

const entry = (template: string, defaults: EmailEntry["defaults"], placeholders: string[]): EmailEntry => ({
  template,
  group: groupOf(template),
  placeholders,
  fields: Object.keys(defaults.en) as EmailField[],
  defaults,
});

export function emailCatalog(): EmailEntry[] {
  const entries: EmailEntry[] = [];
  // Sign-up first, then welcome, as an account's first two emails.
  for (const template of AUTH_TEMPLATES) entries.push(entry(template, authDefaults(template)!, []));
  for (const template of NOTIFICATION_TEMPLATES) {
    const found = notificationDefaults(template)!;
    entries.push(entry(template, found.defaults, found.placeholders));
  }
  entries.push(entry("list_confirm", listConfirmDefaults(), ["shop"]));
  for (const template of INVOICE_TEMPLATES) entries.push(entry(template, invoiceDefaults(template)!, INVOICE_PLACEHOLDERS));
  entries.push(entry("enquiry", enquiryDefaults(), []));
  const order = (template: string) => (template === "auth_signup" ? 0 : template === "welcome" ? 1 : 2);
  return entries.sort((a, b) => EMAIL_GROUPS.indexOf(a.group) - EMAIL_GROUPS.indexOf(b.group) || order(a.template) - order(b.template));
}

export const findEmail = (template: string) => emailCatalog().find((item) => item.template === template) ?? null;

/** What is wrong with wording for one email, if anything: a field it lacks, or an unknown {placeholder}. */
export function wordingProblem(item: EmailEntry, fields: Record<string, string>): "FIELD_UNKNOWN" | "PLACEHOLDER_UNKNOWN" | "TOO_LONG" | null {
  for (const [field, value] of Object.entries(fields)) {
    if (!(item.fields as string[]).includes(field)) return "FIELD_UNKNOWN";
    if (value.length > 3000) return "TOO_LONG";
    // Buttons and tiles take no values; the main text and note may use the email's own.
    const allowed = field === "body" || field === "note" ? item.placeholders : [];
    if (placeholdersIn(value).some((name) => !allowed.includes(name))) return "PLACEHOLDER_UNKNOWN";
  }
  return null;
}
