export type EmailLocale = "en" | "fr";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  subject: string;
  body: string;
  reason?: string;
  action: string;
  path: string;
}

const ROLE_NAMES: Record<EmailLocale, Record<string, string>> = {
  en: { seller: "Seller", seller_staff: "Seller Staff", marketer: "Marketer", admin: "Admin", co_admin: "Co-admin", super_admin: "Super Admin" },
  fr: { seller: "Vendeur", seller_staff: "Personnel du vendeur", marketer: "Marketeur", admin: "Administrateur", co_admin: "Co-administrateur", super_admin: "Super administrateur" },
};

type Build = (role: string) => Copy;

const TEMPLATES: Record<string, Record<EmailLocale, Build>> = {
  welcome: {
    en: () => ({
      subject: "Welcome to Biqbaq",
      body: "Your email is confirmed and your account is ready. You can browse products from sellers in your city, find cargo cars going to Nigeria, and apply to sell from your account.",
      action: "Go to your account",
      path: "/account",
    }),
    fr: () => ({
      subject: "Bienvenue sur Biqbaq",
      body: "Votre adresse courriel est confirmée et votre compte est prêt. Vous pouvez parcourir les produits des vendeurs de votre ville, trouver des véhicules de fret en partance pour le Nigeria et demander à vendre depuis votre compte.",
      action: "Accéder à votre compte",
      path: "/account",
    }),
  },
  application_received: {
    en: (role) => ({
      subject: "New application waiting for review",
      body: `Someone has applied for the ${role} role on Biqbaq, and the application is waiting for your decision.`,
      action: "Review applications",
      path: "/admin/role-applications",
    }),
    fr: (role) => ({
      subject: "Nouvelle demande à examiner",
      body: `Une personne a demandé le rôle ${role} sur Biqbaq, et sa demande attend votre décision.`,
      action: "Examiner les demandes",
      path: "/admin/role-applications",
    }),
  },
  application_approved: {
    en: (role) => ({
      subject: "Your application was approved",
      body: `Good news: your application for the ${role} role on Biqbaq was approved.`,
      action: "Go to your account",
      path: "/account",
    }),
    fr: (role) => ({
      subject: "Votre demande a été approuvée",
      body: `Bonne nouvelle : votre demande pour le rôle ${role} sur Biqbaq a été approuvée.`,
      action: "Accéder à votre compte",
      path: "/account",
    }),
  },
  application_rejected: {
    en: (role) => ({
      subject: "Your application was not approved",
      body: `Your application for the ${role} role on Biqbaq was not approved. You can apply again from your account.`,
      reason: "Reason",
      action: "Go to your account",
      path: "/account",
    }),
    fr: (role) => ({
      subject: "Votre demande n'a pas été approuvée",
      body: `Votre demande pour le rôle ${role} sur Biqbaq n'a pas été approuvée. Vous pouvez en soumettre une nouvelle depuis votre compte.`,
      reason: "Motif",
      action: "Accéder à votre compte",
      path: "/account",
    }),
  },
  verification_verified: {
    en: () => ({
      subject: "Your shop is verified",
      body: "Your shop on Biqbaq is now verified, and it shows as a verified seller.",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "Votre boutique est vérifiée",
      body: "Votre boutique sur Biqbaq est maintenant vérifiée et apparaît comme vendeur vérifié.",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  verification_rejected: {
    en: () => ({
      subject: "Your verification request was not approved",
      body: "Your request to verify your shop on Biqbaq was not approved. You can ask again from My shop.",
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "Votre demande de vérification n'a pas été approuvée",
      body: "Votre demande de vérification de boutique sur Biqbaq n'a pas été approuvée. Vous pouvez en soumettre une nouvelle depuis votre boutique.",
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  verification_suspended: {
    en: () => ({
      subject: "Your shop's verification was suspended",
      body: "The verification of your shop on Biqbaq was suspended, so it now shows as an unverified seller and the limit on published products for unverified sellers applies.",
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "La vérification de votre boutique a été suspendue",
      body: "La vérification de votre boutique sur Biqbaq a été suspendue. Elle apparaît donc comme vendeur non vérifié et la limite de produits publiés des vendeurs non vérifiés s'applique.",
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  verification_restored: {
    en: () => ({
      subject: "Your shop's verification was restored",
      body: "The verification of your shop on Biqbaq was restored, and it shows as a verified seller again.",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "La vérification de votre boutique a été rétablie",
      body: "La vérification de votre boutique sur Biqbaq a été rétablie et elle apparaît de nouveau comme vendeur vérifié.",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  verification_revoked: {
    en: () => ({
      subject: "Your shop's verification was removed",
      body: "The verification of your shop on Biqbaq was removed, so it now shows as an unverified seller and the limit on published products for unverified sellers applies.",
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "La vérification de votre boutique a été retirée",
      body: "La vérification de votre boutique sur Biqbaq a été retirée. Elle apparaît donc comme vendeur non vérifié et la limite de produits publiés des vendeurs non vérifiés s'applique.",
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  product_suspended: {
    en: (product) => ({
      subject: "One of your products was suspended",
      body: `Biqbaq has suspended your product "${product}", so it is no longer on the site. It can't be published, edited or deleted while suspended.`,
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: (product) => ({
      subject: "L'un de vos produits a été suspendu",
      body: `Biqbaq a suspendu votre produit « ${product} », qui n'est donc plus sur le site. Il ne peut pas être publié, modifié ou supprimé pendant la suspension.`,
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  product_restored: {
    en: (product) => ({
      subject: "Your product's suspension was lifted",
      body: `Biqbaq has lifted the suspension on your product "${product}". It is not public yet, so publish it from My shop when you are ready.`,
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: (product) => ({
      subject: "La suspension de votre produit a été levée",
      body: `Biqbaq a levé la suspension de votre produit « ${product} ». Il n'est pas encore public : publiez-le depuis votre boutique lorsque vous serez prêt.`,
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  shop_suspended: {
    en: () => ({
      subject: "Your shop was suspended",
      body: "Biqbaq has suspended your shop, so it and your products are no longer on the site.",
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "Votre boutique a été suspendue",
      body: "Biqbaq a suspendu votre boutique. Elle et vos produits ne sont donc plus sur le site.",
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  shop_restored: {
    en: () => ({
      subject: "Your shop was restored",
      body: "Biqbaq has restored your shop, and it is back on the site.",
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "Votre boutique a été rétablie",
      body: "Biqbaq a rétabli votre boutique, qui est de retour sur le site.",
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  publishing_suspended: {
    en: () => ({
      subject: "Publishing was suspended for your shop",
      body: "Biqbaq has suspended publishing for your shop, so you can't publish products for now. Products already live stay live.",
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "La publication a été suspendue pour votre boutique",
      body: "Biqbaq a suspendu la publication pour votre boutique : vous ne pouvez pas publier de produits pour le moment. Les produits déjà en ligne le restent.",
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  publishing_restored: {
    en: () => ({
      subject: "You can publish again",
      body: "Biqbaq has restored publishing for your shop, so you can publish products again.",
      reason: "Reason",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "Vous pouvez publier de nouveau",
      body: "Biqbaq a rétabli la publication pour votre boutique : vous pouvez de nouveau publier des produits.",
      reason: "Motif",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  role_assigned: {
    en: (role) => ({
      subject: "You have a new role on Biqbaq",
      body: `You have been given the ${role} role on Biqbaq.`,
      action: "Go to your account",
      path: "/account",
    }),
    fr: (role) => ({
      subject: "Vous avez un nouveau rôle sur Biqbaq",
      body: `Le rôle ${role} vous a été attribué sur Biqbaq.`,
      action: "Accéder à votre compte",
      path: "/account",
    }),
  },
  role_suspended: {
    en: (role) => ({
      subject: "One of your roles was suspended",
      body: `Your ${role} role on Biqbaq was suspended, so you can't use it for now. Your account and any other roles are not affected.`,
      reason: "Reason",
      action: "Go to your account",
      path: "/account",
    }),
    fr: (role) => ({
      subject: "L'un de vos rôles a été suspendu",
      body: `Votre rôle ${role} sur Biqbaq a été suspendu : vous ne pouvez pas l'utiliser pour le moment. Votre compte et vos autres rôles ne sont pas touchés.`,
      reason: "Motif",
      action: "Accéder à votre compte",
      path: "/account",
    }),
  },
  role_restored: {
    en: (role) => ({
      subject: "Your role was restored",
      body: `Your ${role} role on Biqbaq was restored, so you can use it again.`,
      reason: "Reason",
      action: "Go to your account",
      path: "/account",
    }),
    fr: (role) => ({
      subject: "Votre rôle a été rétabli",
      body: `Votre rôle ${role} sur Biqbaq a été rétabli : vous pouvez de nouveau l'utiliser.`,
      reason: "Motif",
      action: "Accéder à votre compte",
      path: "/account",
    }),
  },
  role_revoked: {
    en: (role) => ({
      subject: "One of your roles was removed",
      body: `Your ${role} role on Biqbaq was removed. Your account and any other roles are not affected.`,
      reason: "Reason",
      action: "Go to your account",
      path: "/account",
    }),
    fr: (role) => ({
      subject: "L'un de vos rôles a été retiré",
      body: `Votre rôle ${role} sur Biqbaq a été retiré. Votre compte et vos autres rôles ne sont pas touchés.`,
      reason: "Motif",
      action: "Accéder à votre compte",
      path: "/account",
    }),
  },
};

const GREETING: Record<EmailLocale, (name: string | null) => string> = {
  en: (name) => (name ? `Hello ${name},` : "Hello,"),
  fr: (name) => (name ? `Bonjour ${name},` : "Bonjour,"),
};

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Null means this version of the code has no such template. */
export function renderEmail(
  template: string,
  data: { role?: unknown; reason?: unknown; product?: unknown },
  recipient: { name: string | null; locale: string | null },
  siteUrl: string,
): RenderedEmail | null {
  const versions = Object.hasOwn(TEMPLATES, template) ? TEMPLATES[template] : undefined;
  if (!versions) return null;

  const locale: EmailLocale = recipient.locale === "fr" ? "fr" : "en";
  const roleKey = typeof data.role === "string" ? data.role : "";
  const subject = typeof data.product === "string" ? data.product : (ROLE_NAMES[locale][roleKey] ?? roleKey);
  const copy = versions[locale](subject);
  const reason = copy.reason && typeof data.reason === "string" ? data.reason : null;
  const link = `${siteUrl.replace(/\/$/, "")}${locale === "fr" ? "/fr" : ""}${copy.path}`;
  const greeting = GREETING[locale](recipient.name);

  const text = [greeting, copy.body, reason ? `${copy.reason}: ${reason}` : null, `${copy.action}: ${link}`, "Biqbaq"]
    .filter(Boolean)
    .join("\n\n");

  // Names and reasons were typed by people, so nothing they wrote can become markup.
  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(copy.body)}</p>`,
    reason ? `<p><strong>${escapeHtml(copy.reason!)}:</strong> ${escapeHtml(reason)}</p>` : "",
    `<p><a href="${escapeHtml(link)}">${escapeHtml(copy.action)}</a></p>`,
    "<p>Biqbaq</p>",
  ].join("");

  return { subject: copy.subject, text, html };
}
