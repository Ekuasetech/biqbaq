import { fill, NO_CUSTOM, pick, type EmailCustom, type EmailField } from "./custom";
import { emailButton, emailLayout, emailParagraph, siteBase } from "./layout";

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
      body: "Your email is confirmed and your account is ready. Biqbaq brings Nigerians in Canada together with sellers in their own city: shop groceries, fashion, beauty and home goods, find cargo cars heading to Nigeria when you want to send something home, or apply to sell from your account.",
      action: "Go to your account",
      path: "/account",
    }),
    fr: () => ({
      subject: "Bienvenue sur Biqbaq",
      body: "Votre adresse courriel est confirmée et votre compte est prêt. Biqbaq rapproche les Nigérians au Canada des vendeurs de leur ville : achetez des produits d'épicerie, de mode, de beauté et pour la maison, trouvez des voitures cargo en partance pour le Nigeria pour envoyer quelque chose au pays, ou demandez à vendre depuis votre compte.",
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
  // Never the message itself, which stays on Biqbaq (Q-34).
  message_to_seller: {
    en: (shop) => ({
      subject: "New message for your shop",
      body: `A customer sent ${shop} a message on Biqbaq. Read and reply in your inbox. You'll get at most one email an hour for each conversation.`,
      action: "Open your messages",
      path: "/account/messages",
    }),
    fr: (shop) => ({
      subject: "Nouveau message pour votre boutique",
      body: `Un client a envoyé un message à ${shop} sur Biqbaq. Lisez-le et répondez dans votre boîte de réception. Vous recevrez au plus un courriel par heure pour chaque conversation.`,
      action: "Ouvrir vos messages",
      path: "/account/messages",
    }),
  },
  message_to_buyer: {
    en: (shop) => ({
      subject: "New message on Biqbaq",
      body: `${shop} sent you a message on Biqbaq. Read and reply in your inbox. You'll get at most one email an hour for each conversation.`,
      action: "Open your messages",
      path: "/account/messages",
    }),
    fr: (shop) => ({
      subject: "Nouveau message sur Biqbaq",
      body: `${shop} vous a envoyé un message sur Biqbaq. Lisez-le et répondez dans votre boîte de réception. Vous recevrez au plus un courriel par heure pour chaque conversation.`,
      action: "Ouvrir vos messages",
      path: "/account/messages",
    }),
  },
  bulk_email_enabled: {
    en: () => ({
      subject: "Customer emails are on for your shop",
      body: "Biqbaq has turned on customer emails for your shop. You can now build a list of customers who agree to hear from you, and send them updates from My shop.",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "Les courriels aux clients sont activés pour votre boutique",
      body: "Biqbaq a activé les courriels aux clients pour votre boutique. Vous pouvez maintenant créer une liste de clients qui acceptent d'avoir de vos nouvelles, et leur écrire depuis Ma boutique.",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  bulk_email_disabled: {
    en: () => ({
      subject: "Customer emails are off for your shop",
      body: "Biqbaq has turned off customer emails for your shop. Your list is kept, but nothing can be sent to it for now.",
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: () => ({
      subject: "Les courriels aux clients sont désactivés pour votre boutique",
      body: "Biqbaq a désactivé les courriels aux clients pour votre boutique. Votre liste est conservée, mais rien ne peut y être envoyé pour le moment.",
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  bulk_email_paused: {
    en: (shop) => ({
      subject: "Customer emails are paused for your shop",
      body: `Bulk email for ${shop} has paused itself, because recipients reported it as spam, or many unsubscribed or their addresses bounced. This protects every Biqbaq shop's email. Your clients and invoices are not affected. Biqbaq will review it and can turn it back on.`,
      action: "Go to My shop",
      path: "/account/shop",
    }),
    fr: (shop) => ({
      subject: "Les courriels aux clients sont suspendus pour votre boutique",
      body: `Les envois groupés de ${shop} se sont suspendus d'eux-mêmes, parce que des destinataires les ont signalés comme pourriel, ou que beaucoup se sont désabonnés ou que leurs adresses ont échoué. Cela protège les courriels de toutes les boutiques Biqbaq. Vos clients et vos factures ne sont pas touchés. Biqbaq examinera la situation et pourra les réactiver.`,
      action: "Accéder à ma boutique",
      path: "/account/shop",
    }),
  },
  bulk_email_paused_admin: {
    en: (shop) => ({
      subject: "A shop's bulk email paused itself",
      body: `Bulk email for ${shop} paused itself after spam complaints, unsubscribes or bounces passed the limits in Settings. Review it before turning it back on.`,
      action: "Review customer emails",
      path: "/admin/email-lists",
    }),
    fr: (shop) => ({
      subject: "Les envois groupés d'une boutique se sont suspendus",
      body: `Les envois groupés de ${shop} se sont suspendus après que les plaintes pour pourriel, les désabonnements ou les échecs ont dépassé les limites des paramètres. Vérifiez avant de les réactiver.`,
      action: "Examiner les courriels aux clients",
      path: "/admin/email-lists",
    }),
  },
  payments_enabled: {
    en: (x) => ({
      subject: "Online payments are on for your shop",
      body: `Biqbaq has turned on online payments for ${x}. Set them up with Stripe in Shop settings, and buyers can pay for your products once Stripe confirms your account.`,
      action: "Set up payments",
      path: "/account/shop/settings",
    }),
    fr: (x) => ({
      subject: "Les paiements en ligne sont activés pour votre boutique",
      body: `Biqbaq a activé les paiements en ligne pour ${x}. Configurez-les avec Stripe dans les paramètres de la boutique; les acheteurs pourront payer vos produits dès que Stripe aura confirmé votre compte.`,
      action: "Configurer les paiements",
      path: "/account/shop/settings",
    }),
  },
  payments_disabled: {
    en: (x) => ({
      subject: "Online payments are off for your shop",
      body: `Biqbaq has turned off online payments for ${x}. Buyers can still contact you. Orders already paid are not affected.`,
      action: "Go to My shop",
      path: "/account/shop/settings",
    }),
    fr: (x) => ({
      subject: "Les paiements en ligne sont désactivés pour votre boutique",
      body: `Biqbaq a désactivé les paiements en ligne pour ${x}. Les acheteurs peuvent toujours vous écrire. Les commandes déjà payées ne sont pas touchées.`,
      action: "Accéder à ma boutique",
      path: "/account/shop/settings",
    }),
  },
  order_paid: {
    en: (x) => ({
      subject: "Your order is paid",
      body: `Your payment for ${x} went through. The seller will contact you about delivery through Biqbaq messages.`,
      action: "See your orders",
      path: "/account/orders",
    }),
    fr: (x) => ({
      subject: "Votre commande est payée",
      body: `Votre paiement pour ${x} a été accepté. Le vendeur vous contactera pour la livraison par les messages Biqbaq.`,
      action: "Voir vos commandes",
      path: "/account/orders",
    }),
  },
  order_received: {
    en: (x) => ({
      subject: "You have a new order",
      body: `A buyer has paid for ${x}. Their delivery details are on your Orders page. Arrange delivery or pickup with them through Biqbaq messages.`,
      action: "See your orders",
      path: "/account/shop/orders",
    }),
    fr: (x) => ({
      subject: "Vous avez une nouvelle commande",
      body: `Un acheteur a payé ${x}. Ses coordonnées de livraison sont sur votre page Commandes. Organisez la livraison ou le retrait avec lui par les messages Biqbaq.`,
      action: "Voir vos commandes",
      path: "/account/shop/orders",
    }),
  },
  order_refunded: {
    en: (x) => ({
      subject: "You've been refunded",
      body: `The seller has refunded you for ${x}. It can take a few days to show on your statement.`,
      action: "See your orders",
      path: "/account/orders",
    }),
    fr: (x) => ({
      subject: "Vous avez été remboursé",
      body: `Le vendeur vous a remboursé pour ${x}. Le remboursement peut prendre quelques jours avant d'apparaître sur votre relevé.`,
      action: "Voir vos commandes",
      path: "/account/orders",
    }),
  },
  order_fulfilled: {
    en: (x) => ({
      subject: "Your order has been delivered",
      body: `The seller has marked your order for ${x} as delivered. If something's wrong, message them on Biqbaq.`,
      action: "See your orders",
      path: "/account/orders",
    }),
    fr: (x) => ({
      subject: "Votre commande a été livrée",
      body: `Le vendeur a indiqué que votre commande pour ${x} a été livrée. En cas de problème, écrivez-lui sur Biqbaq.`,
      action: "Voir vos commandes",
      path: "/account/orders",
    }),
  },
  order_disputed: {
    en: (x) => ({
      subject: "A payment was disputed",
      body: `A buyer's bank has disputed the payment for ${x}. Respond in your Stripe dashboard before Stripe's deadline, with proof of delivery if you have it.`,
      action: "See your orders",
      path: "/account/shop/orders",
    }),
    fr: (x) => ({
      subject: "Un paiement a été contesté",
      body: `La banque d'un acheteur a contesté le paiement pour ${x}. Répondez dans votre tableau de bord Stripe avant la date limite de Stripe, avec une preuve de livraison si vous en avez une.`,
      action: "Voir vos commandes",
      path: "/account/shop/orders",
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
  staff_invitation: {
    en: (shop) => ({
      subject: "You have been invited to help run a shop on Biqbaq",
      body: `${shop} has invited you to join their staff on Biqbaq. To accept, sign in or create a free account with this email address. Your access starts once they approve you.`,
      action: "Go to your account",
      path: "/account",
    }),
    fr: (shop) => ({
      subject: "Vous êtes invité à aider à gérer une boutique sur Biqbaq",
      body: `${shop} vous invite à rejoindre son personnel sur Biqbaq. Pour accepter, connectez-vous ou créez un compte gratuit avec cette adresse courriel. Votre accès commence dès que la boutique vous approuve.`,
      action: "Accéder à votre compte",
      path: "/account",
    }),
  },
  staff_approved: {
    en: (shop) => ({ subject: "You can start working in the shop", body: `${shop} has approved you, so you can now work in their shop on Biqbaq.`, action: "Go to your account", path: "/account" }),
    fr: (shop) => ({ subject: "Vous pouvez commencer à travailler dans la boutique", body: `${shop} vous a approuvé : vous pouvez maintenant travailler dans sa boutique sur Biqbaq.`, action: "Accéder à votre compte", path: "/account" }),
  },
  staff_suspended: {
    en: (shop) => ({ subject: "Your staff access was suspended", body: `${shop} has suspended your staff access to their shop on Biqbaq.`, action: "Go to your account", path: "/account" }),
    fr: (shop) => ({ subject: "Votre accès de personnel a été suspendu", body: `${shop} a suspendu votre accès de personnel à sa boutique sur Biqbaq.`, action: "Accéder à votre compte", path: "/account" }),
  },
  staff_restored: {
    en: (shop) => ({ subject: "Your staff access was restored", body: `${shop} has restored your staff access to their shop on Biqbaq.`, action: "Go to your account", path: "/account" }),
    fr: (shop) => ({ subject: "Votre accès de personnel a été rétabli", body: `${shop} a rétabli votre accès de personnel à sa boutique sur Biqbaq.`, action: "Accéder à votre compte", path: "/account" }),
  },
  staff_removed: {
    en: (shop) => ({ subject: "Your staff access was removed", body: `${shop} has removed you from their staff on Biqbaq. Your account is not affected.`, action: "Go to your account", path: "/account" }),
    fr: (shop) => ({ subject: "Votre accès de personnel a été retiré", body: `${shop} vous a retiré de son personnel sur Biqbaq. Votre compte n'est pas touché.`, action: "Accéder à votre compte", path: "/account" }),
  },
};

/** The welcome email's extras in the owner's template: its heading and two picture tiles. */
const WELCOME: Record<EmailLocale, { heading: string; products: string; cargo: string }> = {
  en: { heading: "Welcome to Biqbaq", products: "Shop products", cargo: "Find cargo cars" },
  fr: { heading: "Bienvenue sur Biqbaq", products: "Voir les produits", cargo: "Trouver une voiture cargo" },
};

const GREETING: Record<EmailLocale, (name: string | null) => string> = {
  en: (name) => (name ? `Hello ${name},` : "Hello,"),
  fr: (name) => (name ? `Bonjour ${name},` : "Bonjour,"),
};

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** The value each email fills in, shown to Super Admin as a {placeholder}. */
const PLACEHOLDER: Record<string, "role" | "shop" | "product"> = {
  application_received: "role",
  application_approved: "role",
  application_rejected: "role",
  role_assigned: "role",
  role_suspended: "role",
  role_restored: "role",
  role_revoked: "role",
  message_to_seller: "shop",
  message_to_buyer: "shop",
  bulk_email_paused: "shop",
  bulk_email_paused_admin: "shop",
  payments_enabled: "shop",
  payments_disabled: "shop",
  staff_invitation: "shop",
  staff_approved: "shop",
  staff_suspended: "shop",
  staff_restored: "shop",
  staff_removed: "shop",
  product_suspended: "product",
  product_restored: "product",
  order_paid: "product",
  order_received: "product",
  order_refunded: "product",
  order_fulfilled: "product",
  order_disputed: "product",
};

export const NOTIFICATION_TEMPLATES = Object.keys(TEMPLATES);

/** Each notification email's built-in wording, with its {placeholder}, for Super Admin's editor. */
export function notificationDefaults(template: string): { placeholders: string[]; defaults: Record<EmailLocale, Partial<Record<EmailField, string>>> } | null {
  const versions = Object.hasOwn(TEMPLATES, template) ? TEMPLATES[template] : undefined;
  if (!versions) return null;
  const placeholder = PLACEHOLDER[template];
  const defaults = {} as Record<EmailLocale, Partial<Record<EmailField, string>>>;
  for (const locale of ["en", "fr"] as const) {
    const copy = versions[locale](placeholder ? `{${placeholder}}` : "");
    defaults[locale] = { body: copy.body, action: copy.action };
    if (template === "welcome") {
      defaults[locale] = { ...defaults[locale], heading: WELCOME[locale].heading, tile_products: WELCOME[locale].products, tile_cargo: WELCOME[locale].cargo };
    }
  }
  return { placeholders: placeholder ? [placeholder] : [], defaults };
}

/** Wording on several lines becomes several paragraphs. */
const paragraphs = (text: string, style?: string) =>
  text
    .split(/\n{2,}/)
    .map((part) => emailParagraph(escapeHtml(part.trim()).replaceAll("\n", "<br>"), style))
    .join("");

/** Null means this version of the code has no such template. */
export function renderEmail(
  template: string,
  data: { role?: unknown; reason?: unknown; product?: unknown; shop?: unknown },
  recipient: { name: string | null; locale: string | null },
  siteUrl: string,
  custom: EmailCustom = NO_CUSTOM,
): RenderedEmail | null {
  const versions = Object.hasOwn(TEMPLATES, template) ? TEMPLATES[template] : undefined;
  if (!versions) return null;

  const locale: EmailLocale = recipient.locale === "fr" ? "fr" : "en";
  const roleKey = typeof data.role === "string" ? data.role : "";
  const named = [data.shop, data.product].find((value) => typeof value === "string") as string | undefined;
  const value = named ?? ROLE_NAMES[locale][roleKey] ?? roleKey;
  const placeholder = PLACEHOLDER[template];
  // The built-in wording keeps its {placeholder}, so Super Admin's wording and it are filled in alike.
  const builtIn = versions[locale](placeholder ? `{${placeholder}}` : "");
  const values: Record<string, string> = placeholder ? { [placeholder]: value } : {};
  const body = fill(pick(custom, template, locale, "body", builtIn.body), values);
  const action = fill(pick(custom, template, locale, "action", builtIn.action), values);
  const reason = builtIn.reason && typeof data.reason === "string" ? data.reason : null;
  const root = `${siteBase(siteUrl)}${locale === "fr" ? "/fr" : ""}`;
  const link = `${root}${builtIn.path}`;
  const greeting = GREETING[locale](recipient.name);

  const text = [greeting, body, reason ? `${builtIn.reason}: ${reason}` : null, `${action}: ${link}`, "Biqbaq"]
    .filter(Boolean)
    .join("\n\n");

  // Names, reasons and Super Admin's wording are all text: nothing in them can become markup.
  if (template === "welcome") {
    const extras = {
      heading: pick(custom, template, locale, "heading", WELCOME[locale].heading),
      products: pick(custom, template, locale, "tile_products", WELCOME[locale].products),
      cargo: pick(custom, template, locale, "tile_cargo", WELCOME[locale].cargo),
    };
    const html = emailLayout({
      locale,
      siteUrl,
      content: "",
      preheader: escapeHtml(body),
      welcome: {
        heading: escapeHtml(extras.heading),
        panel: `<p style="margin:0 0 12px">${escapeHtml(greeting)}</p>${body
          .split(/\n{2,}/)
          .map((part) => `<p style="margin:0 0 12px">${escapeHtml(part.trim()).replaceAll("\n", "<br>")}</p>`)
          .join("")}`,
        button: { href: escapeHtml(link), label: escapeHtml(action) },
        hero: custom.images.hero,
        tiles: [
          { href: escapeHtml(`${root}/products`), label: escapeHtml(extras.products), image: custom.images.products ?? "/email/tile-products.jpg" },
          { href: escapeHtml(`${root}/cargo-cars`), label: escapeHtml(extras.cargo), image: custom.images.cargo ?? "/email/tile-cargo.jpg" },
        ],
      },
    });
    const welcomeText = [greeting, body, `${action}: ${link}`, `${extras.products}: ${root}/products`, `${extras.cargo}: ${root}/cargo-cars`, "Biqbaq"].join("\n\n");
    return { subject: builtIn.subject, text: welcomeText, html };
  }
  const html = emailLayout({
    locale,
    siteUrl,
    preheader: escapeHtml(body),
    content: [
      emailParagraph(escapeHtml(greeting)),
      paragraphs(body),
      reason ? emailParagraph(`<strong>${escapeHtml(builtIn.reason!)}:</strong> ${escapeHtml(reason)}`) : "",
      emailButton(escapeHtml(link), escapeHtml(action)),
    ].join(""),
  });

  return { subject: builtIn.subject, text, html };
}
