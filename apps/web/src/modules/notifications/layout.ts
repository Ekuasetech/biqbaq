import type { EmailLocale } from "./templates";

/**
 * Biqbaq's email design (owner's template, 2026-11-11), in the website's colours: a navy
 * band with the name, the message on a white card with a red button, and a dark navy footer
 * with the logo at the bottom. The welcome email adds a large photo, a navy "Welcome" panel
 * and two picture tiles. Built from tables and inline styles, which email programs show
 * reliably; every word that came from a person is escaped before it gets here.
 */
export const EMAIL_COLOURS = {
  navy: "#0c2352",
  darkNavy: "#041335",
  red: "#d01d21",
  cream: "#f7f4ee",
  text: "#1b1f2b",
  muted: "#5b6475",
  line: "#e6e1d8",
} as const;

const FONT = "font-family:Helvetica,Arial,sans-serif";

export const siteBase = (siteUrl: string) => siteUrl.replace(/\/$/, "");

/** The site's own address, for emails built without one (its images and links point here). */
export const defaultSiteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** The main link, as a red button that still works where images and styles are off. */
export function emailButton(href: string, label: string) {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr>` +
    `<td style="background:${EMAIL_COLOURS.red};border-radius:10px">` +
    `<a href="${href}" style="display:inline-block;padding:13px 26px;${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px">${label}</a>` +
    `</td></tr></table>`
  );
}

export const emailParagraph = (html: string, style = "") =>
  `<p style="margin:0 0 14px;${FONT};font-size:15px;line-height:1.6;color:${EMAIL_COLOURS.text};${style}">${html}</p>`;

export const emailSmall = (html: string) =>
  `<p style="margin:0 0 8px;${FONT};font-size:12px;line-height:1.5;color:${EMAIL_COLOURS.muted}">${html}</p>`;

const FOOTER: Record<EmailLocale, { line: string; visit: string }> = {
  en: { line: "Biqbaq connects Nigerians in Canada with sellers in their own city.", visit: "Visit Biqbaq" },
  fr: { line: "Biqbaq relie les Nigérians au Canada aux vendeurs de leur ville.", visit: "Visiter Biqbaq" },
};

export interface WelcomeExtras {
  heading: string;
  /** Already escaped HTML, shown on the navy panel. */
  panel: string;
  button: { href: string; label: string };
  /** Super Admin's photo for the top; the built-in one otherwise. A full address or a site path. */
  hero?: string;
  tiles: { href: string; label: string; image: string }[];
}

/** An uploaded photo's full address as it is, or a photo of the site's own by its path. */
const imageUrl = (base: string, image: string) => (/^https:\/\//.test(image) ? image : `${base}${image}`);

/** A whole email: the page around the message. `content` is already escaped HTML. */
export function emailLayout(options: { locale: EmailLocale; siteUrl: string; content: string; preheader?: string; welcome?: WelcomeExtras }) {
  const base = siteBase(options.siteUrl);
  const home = `${base}${options.locale === "fr" ? "/fr" : ""}/`;
  const footer = FOOTER[options.locale];
  const welcome = options.welcome;

  const header =
    `<tr><td style="background:${EMAIL_COLOURS.navy};padding:18px 28px;border-radius:16px 16px 0 0">` +
    `<a href="${home}" style="${FONT};font-size:22px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:-0.5px">Biqbaq</a>` +
    `</td></tr>`;

  const hero = welcome
    ? `<tr><td style="padding:0;line-height:0"><img src="${imageUrl(base, welcome.hero ?? "/email/welcome-hero.jpg")}" width="600" height="300" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>` +
      `<tr><td style="background:${EMAIL_COLOURS.navy};padding:36px 32px 34px">` +
      `<h1 style="margin:0 0 18px;${FONT};font-size:40px;line-height:1.1;font-weight:800;color:#ffffff">${welcome.heading}</h1>` +
      `<div style="${FONT};font-size:15px;line-height:1.6;color:#e7ebf5">${welcome.panel}</div>` +
      emailButton(welcome.button.href, welcome.button.label) +
      `</td></tr>`
    : "";

  const tiles = welcome
    ? `<tr><td style="background:#16306b;padding:22px 22px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
      welcome.tiles
        .map(
          (tile) =>
            `<td width="50%" valign="top" style="padding:0 8px">` +
            `<a href="${tile.href}" style="text-decoration:none"><img src="${imageUrl(base, tile.image)}" width="260" height="195" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:12px"></a>` +
            `<a href="${tile.href}" style="display:block;margin-top:12px;${FONT};font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">${tile.label} &rarr;</a>` +
            `</td>`,
        )
        .join("") +
      `</tr></table></td></tr>`
    : "";

  const body = options.content
    ? `<tr><td style="background:#ffffff;padding:32px 32px 24px${welcome ? "" : ";border-radius:0"}">${options.content}</td></tr>`
    : "";

  const foot =
    `<tr><td align="center" style="background:${EMAIL_COLOURS.darkNavy};padding:30px 28px 32px;border-radius:0 0 16px 16px">` +
    `<p style="margin:0 0 16px;${FONT};font-size:13px;line-height:1.5;color:#c9d1e6">${footer.line}</p>` +
    `<a href="${home}" style="${FONT};font-size:13px;font-weight:bold;color:#ffffff">${footer.visit}</a>` +
    `<div style="margin-top:22px"><a href="${home}"><img src="${base}/biqbaq.png" width="64" height="60" alt="Biqbaq" style="display:inline-block;border:0;background:#ffffff;border-radius:14px;padding:6px"></a></div>` +
    `</td></tr>`;

  return (
    `<!doctype html><html lang="${options.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Biqbaq</title></head>` +
    `<body style="margin:0;padding:0;background:${EMAIL_COLOURS.cream}">` +
    // The line shown after the subject in an inbox list; hidden in the email itself.
    (options.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${options.preheader}</div>` : "") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${EMAIL_COLOURS.cream}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">` +
    header +
    hero +
    tiles +
    body +
    foot +
    `</table></td></tr></table></body></html>`
  );
}

/** Puts a line at the very top of an email's body, such as the note on a redirected test email. */
export function withTopNote(html: string, note: string) {
  const line = `<p style="margin:0;padding:10px;background:#fff7d6;${FONT};font-size:13px"><em>${note}</em></p>`;
  const at = html.search(/<body[^>]*>/i);
  if (at === -1) return `${line}${html}`;
  const end = html.indexOf(">", at) + 1;
  return `${html.slice(0, end)}${line}${html.slice(end)}`;
}
