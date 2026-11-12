import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, fail, failFromDatabase } from "@/modules/media-management/server";
import { findEmail, wordingProblem } from "@/modules/notifications/catalog";
import { forgetEmailCustom } from "@/modules/notifications/load-custom";

const bodySchema = z.object({ locale: z.enum(["en", "fr"]), fields: z.record(z.string(), z.string().max(3000)) });

/**
 * Saves one email's wording for one language. Only known fields and that email's own
 * {placeholders} are allowed; a blank field goes back to the built-in wording.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ template: string }> }) {
  const item = findEmail((await params).template);
  if (!item) return fail(404, "EMAIL_NOT_FOUND");
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "DETAILS_INVALID");
  const problem = wordingProblem(item, body.data.fields);
  if (problem) return fail(400, problem);
  const { supabase, user } = await currentUser();
  if (!user) return fail(401, "NOT_SIGNED_IN");
  const { error } = await supabase.rpc("admin_save_email_texts", { p_template: item.template, p_locale: body.data.locale, p_fields: body.data.fields });
  if (error) return failFromDatabase(error);
  forgetEmailCustom();
  return new NextResponse(null, { status: 204 });
}
