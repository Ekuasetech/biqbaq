/**
 * The public address of the site, such as https://www.biqbaq.com, for redirects and links
 * built on the server. Behind the host's proxy (Render), the request's own address is the
 * internal one (https://localhost:10000), so NEXT_PUBLIC_SITE_URL comes first; the request
 * is only the fallback, for local development.
 */
export const siteOrigin = (request: Request) =>
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || new URL(request.url).origin;
