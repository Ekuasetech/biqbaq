import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { invoiceSchema, previewInvoice } from "@/modules/invoicing";
import { renderInvoicePdf } from "@/modules/invoicing/pdf";

/**
 * A preview PDF of an invoice or receipt that has not been sent, marked as a preview.
 * The signed-in person's own access decides everything, through the database functions.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { locale?: unknown } | null;
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "DETAILS_INVALID" }, { status: 400 });
  const input = parsed.data;

  const supabase = await getSupabaseServerClient();
  const { data: lists, error } = await supabase.rpc("my_email_list", { p_seller: input.seller });
  const list = (lists as { enabled: boolean; sender_name: string; mailing_address: string | null }[] | null)?.[0];
  if (error || !list?.enabled) return NextResponse.json({ error: "NOT_ALLOWED" }, { status: 403 });
  if (!list.mailing_address) return NextResponse.json({ error: "ADDRESS_REQUIRED" }, { status: 409 });

  const email = input.clientEmail.toLowerCase();
  const { data: clients } = await supabase.rpc("list_subscribers_page", { p_seller: input.seller, p_search: email, p_limit: 20 });
  const client = (clients as { email: string; name: string | null; phone: string | null }[] | null)?.find((row) => row.email === email);
  if (!client) return NextResponse.json({ error: "CLIENT_NOT_FOUND" }, { status: 404 });

  const locale = z.enum(["en", "fr"]).catch("en").parse(body?.locale);
  const draft = previewInvoice(input, { name: client.name ?? client.email, phone: client.phone }, { name: list.sender_name, address: list.mailing_address }, input.kind === "invoice" ? "INV-DRAFT" : "RCT-DRAFT");
  const pdf = await renderInvoicePdf(draft, { locale, preview: true });
  return new NextResponse(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="preview.pdf"', "Cache-Control": "no-store" },
  });
}
