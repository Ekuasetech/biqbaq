import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";
import { findEmail, wordingProblem } from "@/modules/notifications/catalog";
import { customFromRows, textKey, type EmailField } from "@/modules/notifications/custom";

const bodySchema = z.object({ template: z.string(), locale: z.enum(["en", "fr"]), fields: z.record(z.string(), z.string().max(3000)) });

/** Super Admin's unsaved wording, shown in the real email design with sample details. */
export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "DETAILS_INVALID");
  const item = findEmail(body.data.template);
  if (!item) return fail(404, "EMAIL_NOT_FOUND");
  const problem = wordingProblem(item, body.data.fields);
  if (problem) return fail(400, problem);
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const saved = await supabase.rpc("admin_list_email_texts");
  if (saved.error) return failFromDatabase(saved.error);
  const photos = await getSupabaseAdminClient()
    .from("site_images")
    .select("slot, image_url")
    .in("slot", ["email_welcome_hero", "email_tile_products", "email_tile_cargo"]);
  const photo = (slot: string) => ((photos.data ?? []) as { slot: string; image_url: string }[]).find((row) => row.slot === slot)?.image_url;
  const custom = customFromRows((saved.data ?? []) as { template: string; locale: string; field: string; value: string }[], {
    hero: photo("email_welcome_hero"),
    products: photo("email_tile_products"),
    cargo: photo("email_tile_cargo"),
  });
  for (const [field, value] of Object.entries(body.data.fields)) {
    custom.texts[textKey(item.template, body.data.locale, field as EmailField)] = value;
  }
  const { previewEmail } = await import("@/modules/notifications/preview");
  const email = previewEmail(item.template, body.data.locale, new URL(request.url).origin, custom);
  if (!email) return fail(404, "EMAIL_NOT_FOUND");
  return NextResponse.json({ data: { subject: email.subject, html: email.html } });
}
