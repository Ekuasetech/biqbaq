import "server-only";
import { NextResponse } from "next/server";

// The links in list emails carry a token that stands in for signing in, so the routes
// using it only ever accept the exact format the database makes.
export const LIST_TOKEN = /^[0-9a-f]{64}$/;

export async function tokenFrom(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get("t");
  if (fromQuery) return LIST_TOKEN.test(fromQuery) ? fromQuery : null;
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  return typeof body?.token === "string" && LIST_TOKEN.test(body.token) ? body.token : null;
}

export const badLink = () => NextResponse.json({ error: "LINK_INVALID" }, { status: 404 });
