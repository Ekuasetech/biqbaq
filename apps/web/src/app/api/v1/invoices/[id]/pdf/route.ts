import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { StoredInvoice } from "@/modules/invoicing";
import { invoiceFileName, renderInvoicePdf } from "@/modules/invoicing/pdf";

/** The PDF of a sent invoice or receipt, for its shop (or Super Admin, for Biqbaq's). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const seller = url.searchParams.get("seller");
  if (!z.uuid().safeParse(id).success || (seller !== null && !z.uuid().safeParse(seller).success)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  const { data, error } = await (await getSupabaseServerClient()).rpc("get_invoice", { p_seller: seller, p_id: id });
  if (error || !data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const invoice = data as StoredInvoice;
  const pdf = await renderInvoicePdf(invoice, { locale: url.searchParams.get("locale") === "fr" ? "fr" : "en" });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceFileName(invoice)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
