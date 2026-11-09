import "server-only";

/**
 * Tells the owner's inbox about a new sign-up through FormSubmit (formsubmit.co), as the
 * owner asked. Sent from the server, so the receiving address never appears in the page.
 * FormSubmit needs the site's address as the referrer, and the receiving address must be
 * activated once from the email FormSubmit sends it the first time.
 *
 * Test addresses (@example.com) are never sent, so automated tests do not reach the inbox.
 */
export async function notifyFormSubmit(input: { to: string; subscriber: string; locale: string; siteOrigin: string }) {
  if (input.subscriber.endsWith("@example.com")) return "skipped" as const;
  try {
    const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(input.to)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: input.siteOrigin, Referer: `${input.siteOrigin}/` },
      body: JSON.stringify({
        _subject: "New Biqbaq subscriber",
        _template: "table",
        email: input.subscriber,
        language: input.locale === "fr" ? "French" : "English",
        source: "Sign-up pop-up",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => null)) as { success?: string | boolean; message?: string } | null;
    if (body?.success === true || body?.success === "true") return "sent" as const;
    // Most often: the address has not been activated yet (FormSubmit has emailed it a link).
    console.error("FormSubmit did not accept the sign-up", response.status, /activat/i.test(body?.message ?? "") ? "needs activation" : "refused");
    return "failed" as const;
  } catch {
    console.error("FormSubmit could not be reached");
    return "failed" as const;
  }
}
