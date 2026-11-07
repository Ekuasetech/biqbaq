// Shared by the view route and its tests, with no secrets.

// Crawlers, link previews and monitors. Most never run the page's scripts, so they never
// report a view at all; this catches the ones that do.
const BOT = /bot|crawl|spider|slurp|scrap|facebookexternalhit|embedly|preview|monitor|uptime|lighthouse|pingdom|python-requests|curl|wget|httpclient|okhttp|go-http/i;

export const isBot = (userAgent: string | null) => !userAgent || BOT.test(userAgent);

/** Who a view is from: the account when signed in, otherwise the address and browser together. */
export const visitorKey = (userId: string | null, address: string, userAgent: string) =>
  userId ? `user:${userId}` : `anon:${address}|${userAgent}`;
