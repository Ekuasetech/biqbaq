/**
 * Returns a path that is safe to redirect to after an email link, or the fallback.
 * Only paths on this site qualify: "//host" and "/\host" are treated by browsers as
 * other sites, which would let a crafted link send people anywhere.
 */
export function safeInternalPath(path: string | null, fallback = "/"): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}
