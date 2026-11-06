import { NextResponse, type NextRequest } from "next/server";
import { suggest } from "@/modules/search";

const MAX_QUERY_LENGTH = 100;

// Public read endpoint for the search box, shared with the mobile app later.
// Rate limiting arrives with the backend (see security-architecture.md).
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  return NextResponse.json(
    { data: await suggest(q) },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}
