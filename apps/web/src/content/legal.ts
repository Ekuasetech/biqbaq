// Biqbaq's Conditions of Use and Privacy Notice, approved by the owner on 2026-11-14 (Q-19).
// Biqbaq is operated by an individual in Ontario. Change the `updated` date whenever the text
// changes, and keep the French version matching.

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  /** "Last updated: …", shown under the title. */
  updated: string;
  intro: string;
  sections: LegalSection[];
}

type LegalContent = Record<"conditions" | "privacy", LegalDocument>;

const en: LegalContent = {
  conditions: {
    title: "Conditions of Use",
    updated: "Last updated: November 14, 2026",
    intro:
      "These Conditions of Use apply when you use Biqbaq (biqbaq.com), a marketplace operated by an individual based in Ontario, Canada. By using Biqbaq, you agree to them.",
    sections: [
      {
        heading: "1. What Biqbaq is",
        paragraphs: [
          "Biqbaq connects Nigerians in Canada with sellers, businesses and car dealers based in Canada. Sellers list products and services, and dealers list vehicles going to Nigeria that may have space for cargo.",
          "Biqbaq is a platform. Unless we clearly say otherwise, sellers and dealers are independent, and any sale or cargo arrangement is between you and them.",
        ],
      },
      {
        heading: "2. Your account",
        paragraphs: [
          "You must be at least 18 years old to create an account. Give accurate information, keep your password secure, and tell us if you think someone else has used your account.",
          "You are responsible for activity on your account. One person should use one account, and additional roles are requested from that account.",
        ],
      },
      {
        heading: "3. Selling on Biqbaq",
        paragraphs: [
          "Seller roles require approval. Approval is not the same as identity verification, and products from sellers who have not been verified show an \"Unverified Seller\" label. Unverified sellers may have a limit on how many products they can publish.",
          "Sellers must describe their products, prices and availability accurately, follow the laws that apply to what they sell, and handle their own orders, customers and taxes. Sellers must be based in Canada.",
        ],
      },
      {
        heading: "4. Cargo cars",
        paragraphs: [
          "Biqbaq does not transport, store, insure or inspect vehicles or goods. Dates and available space are estimates from the dealer, so confirm all details with the dealer before you arrange anything.",
          "You and the dealer are responsible for following all shipping, customs, import and export laws, and for any duties or fees. Do not send anything prohibited by law or by the dealer's cargo restrictions.",
        ],
      },
      {
        heading: "5. Payments",
        paragraphs: [
          "Where online payment is available for a seller, it is processed by Stripe, a third-party payment provider, and paid to the seller's connected account. Any Biqbaq service fee is shown before you pay. Stripe's own terms also apply.",
        ],
      },
      {
        heading: "6. Your content",
        paragraphs: [
          "You keep ownership of what you post, such as listings, photos, reviews, messages and blog posts. You give Biqbaq a non-exclusive licence to host, display and promote that content in order to run the platform. Only post content you have the right to use.",
          "We may review, refuse or remove content. Blog posts by sellers require approval before they are published.",
        ],
      },
      {
        heading: "7. What you must not do",
        paragraphs: [
          "Do not post false, misleading, illegal or infringing content, sell prohibited items, harass others, send spam, get around publishing limits or security controls, or use automated tools to misuse the site or its public API.",
        ],
      },
      {
        heading: "8. Advertising and third-party links",
        paragraphs: [
          "Biqbaq shows advertisements, which are labelled, and links to other websites. We are not responsible for third-party content, products or services.",
        ],
      },
      {
        heading: "9. General information",
        paragraphs: [
          "Immigration updates, job information, exchange rates and weather are provided for general information only, and may be out of date. They are not legal, immigration or financial advice, and exchange rates shown may differ from bank or remittance rates.",
        ],
      },
      {
        heading: "10. Suspension and closure",
        paragraphs: [
          "We may suspend or remove accounts, roles, listings or access if these Conditions are broken, or to protect users or the platform. You may stop using Biqbaq at any time.",
        ],
      },
      {
        heading: "11. Disclaimers and liability",
        paragraphs: [
          "Biqbaq is provided as is. To the extent the law allows, we do not guarantee sellers, dealers, listings or uninterrupted service, and we are not liable for indirect losses or for dealings between users. Nothing here limits rights you have under consumer protection law.",
        ],
      },
      {
        heading: "12. Changes and governing law",
        paragraphs: [
          "We may update these Conditions, and will post the new version with its date. These Conditions are governed by the laws of Ontario and the federal laws of Canada that apply there.",
        ],
      },
      {
        heading: "13. Contact",
        paragraphs: ["Questions about these Conditions can be sent to support@biqbaq.com."],
      },
    ],
  },
  privacy: {
    title: "Privacy Notice",
    updated: "Last updated: November 14, 2026",
    intro:
      "This Privacy Notice explains how Biqbaq (\"we\", \"us\") collects, uses and shares personal information when you use biqbaq.com. Biqbaq is operated by an individual based in Ontario, Canada, and handles personal information in line with Canadian privacy law, including the Personal Information Protection and Electronic Documents Act (PIPEDA).",
    sections: [
      {
        heading: "1. Information we collect",
        paragraphs: [
          "Account: your name, email address and password (stored only in scrambled form), or, if you sign in with Google, the details described in section 2.",
          "Sellers and dealers: shop or business details, contact information, payout details held by our payment provider and, for verification, identity documents or supporting evidence.",
          "Activity: listings, photos, messages, reviews, favourites, comments, blog posts, role applications and referrals. If you contact a seller without an account, we process your name, email address and message.",
          "Orders: what you ordered, from whom, amounts, delivery details you provide, and payment references. Card details are entered directly with Stripe, our payment provider; we never see or store your full card number.",
          "Email and notifications: if you join an email list, your email address, language and when you agreed; if you turn on phone notifications, the browser's notification address for your device.",
          "Technical: device and usage information such as IP address, browser type, pages viewed and listing view counts, used to run, secure and improve the site.",
        ],
      },
      {
        heading: "2. Google sign-in",
        paragraphs: [
          "If you choose to sign in with Google, Google shares your name, email address and profile picture with us, with your permission. We do not receive your Google password, and we do not ask for access to your Gmail, contacts, calendar, Drive or any other Google data.",
          "We use this information only to create your Biqbaq account and sign you in. We do not sell it, use it for advertising, or share it with anyone other than the provider that stores our accounts (Supabase). Our use of information received from Google follows the Google API Services User Data Policy, including its Limited Use requirements.",
          "You can remove Biqbaq's access at any time in your Google Account's security settings, and you can ask us to delete your Biqbaq account by writing to support@biqbaq.com.",
        ],
      },
      {
        heading: "3. How we use it",
        paragraphs: [
          "We use personal information to run your account, show listings, connect buyers with sellers and dealers, process orders and payments, review applications and verify sellers, send service messages (such as sign-in, order and message emails), prevent fraud and abuse, keep records, improve the platform, and meet legal obligations.",
          "We send promotional emails only with your consent, as Canada's Anti-Spam Legislation requires, and every one has an unsubscribe link. A seller you have bought from or contacted may email you about their shop through Biqbaq; those emails also have an unsubscribe link.",
        ],
      },
      {
        heading: "4. What others can see",
        paragraphs: [
          "Your public listings, shop name, city, verification status and reviews can be seen by anyone. Private seller email addresses are not shown on the site or in the public API, but if a seller replies to an enquiry by email, the person receiving it will see that address.",
        ],
      },
      {
        heading: "5. Who we share it with",
        paragraphs: [
          "We share information with the other party to a conversation or order, and with service providers who help run Biqbaq, only for that purpose: Render (website hosting), Supabase (database, accounts and sign-in), Cloudinary (photos), Resend (sending email), Stripe (payments), FormSubmit (telling us about new email list sign-ups), Google (sign-in, if you choose it) and your browser's push service (phone notifications you turn on). We do not sell personal information.",
          "We may also share information when the law requires it or to protect the rights and safety of users and the public. These providers may store or process information outside Canada, mainly in the United States, where it may be accessed under the laws of that country.",
        ],
      },
      {
        heading: "6. Verification documents",
        paragraphs: [
          "Identity documents and evidence are kept in restricted storage, are available only to authorised reviewers, and each access is logged.",
        ],
      },
      {
        heading: "7. Cookies and browser storage",
        paragraphs: [
          "We use cookies that are needed to keep you signed in and secure, and browser storage to remember choices such as language and theme and a referral code you arrive with. We do not use advertising or cross-site tracking cookies.",
        ],
      },
      {
        heading: "8. How long we keep it",
        paragraphs: [
          "We keep account information while your account is open, and other information only as long as needed for the purposes above. When it is no longer needed, we delete or anonymise it. Order, payment and invoice records are kept for as long as Canadian tax and accounting law requires (generally six years), and records of verification decisions and security logs may be kept longer to protect users and the platform.",
        ],
      },
      {
        heading: "9. Security",
        paragraphs: [
          "We use safeguards suited to the sensitivity of the information, including encrypted connections, access controls and logging of sensitive actions. No system is completely secure, so please use a strong password and tell us about any suspected misuse.",
        ],
      },
      {
        heading: "10. Your choices and rights",
        paragraphs: [
          "You can ask to access, correct or delete your personal information, or withdraw your consent, subject to legal limits, by writing to support@biqbaq.com. We reply within 30 days. You can unsubscribe from any email list through the link in its emails, and change your notification settings in your account.",
          "If you are not satisfied with our response, you may complain to the Office of the Privacy Commissioner of Canada.",
        ],
      },
      {
        heading: "11. Age",
        paragraphs: [
          "Biqbaq is for people aged 18 and over. We do not knowingly collect personal information from anyone under 18, and we delete it if we learn that we have.",
        ],
      },
      {
        heading: "12. Changes",
        paragraphs: ["We may update this Notice, and will post the new version on this page with its date."],
      },
      {
        heading: "13. Contact",
        paragraphs: ["Questions, requests and complaints about privacy can be sent to Biqbaq's privacy contact at support@biqbaq.com."],
      },
    ],
  },
};

const fr: LegalContent = {
  conditions: {
    title: "Conditions d'utilisation",
    updated: "Dernière mise à jour : 14 novembre 2026",
    intro:
      "Les présentes conditions d'utilisation s'appliquent lorsque vous utilisez Biqbaq (biqbaq.com), un marché exploité par un particulier établi en Ontario, au Canada. En utilisant Biqbaq, vous les acceptez.",
    sections: [
      {
        heading: "1. Qu'est-ce que Biqbaq",
        paragraphs: [
          "Biqbaq relie les Nigérians au Canada à des vendeurs, des entreprises et des concessionnaires automobiles établis au Canada. Les vendeurs publient des produits et des services, et les concessionnaires publient des véhicules en partance pour le Nigeria pouvant avoir de l'espace pour des marchandises.",
          "Biqbaq est une plateforme. Sauf indication claire contraire, les vendeurs et les concessionnaires sont indépendants, et toute vente ou entente de transport est conclue entre eux et vous.",
        ],
      },
      {
        heading: "2. Votre compte",
        paragraphs: [
          "Vous devez avoir au moins 18 ans pour créer un compte. Fournissez des renseignements exacts, protégez votre mot de passe et avisez-nous si vous croyez qu'une autre personne a utilisé votre compte.",
          "Vous êtes responsable de l'activité de votre compte. Chaque personne devrait utiliser un seul compte, à partir duquel elle demande des rôles supplémentaires.",
        ],
      },
      {
        heading: "3. Vendre sur Biqbaq",
        paragraphs: [
          "Les rôles de vendeur doivent être approuvés. L'approbation ne constitue pas une vérification d'identité, et les produits de vendeurs non vérifiés portent la mention « Vendeur non vérifié ». Le nombre de produits que ces vendeurs peuvent publier peut être limité.",
          "Les vendeurs doivent décrire leurs produits, leurs prix et leur disponibilité avec exactitude, respecter les lois applicables à ce qu'ils vendent et gérer eux-mêmes leurs commandes, leurs clients et leurs taxes. Les vendeurs doivent être établis au Canada.",
        ],
      },
      {
        heading: "4. Voitures cargo",
        paragraphs: [
          "Biqbaq ne transporte, n'entrepose, n'assure ni n'inspecte les véhicules ou les marchandises. Les dates et l'espace disponible sont des estimations du concessionnaire : confirmez tous les détails avec lui avant de prendre vos dispositions.",
          "Le concessionnaire et vous êtes responsables du respect de toutes les lois sur l'expédition, les douanes, l'importation et l'exportation, ainsi que des droits et des frais. N'envoyez rien qui soit interdit par la loi ou par les restrictions du concessionnaire.",
        ],
      },
      {
        heading: "5. Paiements",
        paragraphs: [
          "Lorsque le paiement en ligne est offert pour un vendeur, il est traité par Stripe, un fournisseur de paiement tiers, et versé au compte connecté du vendeur. Tous frais de service de Biqbaq sont affichés avant le paiement. Les conditions de Stripe s'appliquent également.",
        ],
      },
      {
        heading: "6. Votre contenu",
        paragraphs: [
          "Vous demeurez propriétaire de ce que vous publiez, comme les annonces, les photos, les avis, les messages et les billets de blogue. Vous accordez à Biqbaq une licence non exclusive pour héberger, afficher et promouvoir ce contenu afin d'exploiter la plateforme. Publiez uniquement du contenu que vous avez le droit d'utiliser.",
          "Nous pouvons examiner, refuser ou retirer du contenu. Les billets de blogue des vendeurs doivent être approuvés avant leur publication.",
        ],
      },
      {
        heading: "7. Ce qui est interdit",
        paragraphs: [
          "Ne publiez aucun contenu faux, trompeur, illégal ou contrefait, ne vendez aucun article interdit, ne harcelez personne, n'envoyez pas de pourriels, ne contournez pas les limites de publication ou les mesures de sécurité et n'utilisez pas d'outils automatisés pour abuser du site ou de son API publique.",
        ],
      },
      {
        heading: "8. Publicité et liens de tiers",
        paragraphs: [
          "Biqbaq affiche des publicités, qui sont identifiées, et des liens vers d'autres sites Web. Nous ne sommes pas responsables du contenu, des produits ou des services de tiers.",
        ],
      },
      {
        heading: "9. Renseignements généraux",
        paragraphs: [
          "Les nouvelles sur l'immigration, les renseignements sur l'emploi, les taux de change et la météo sont fournis à titre informatif seulement et peuvent ne pas être à jour. Ils ne constituent pas un avis juridique, financier ou en matière d'immigration, et les taux de change affichés peuvent différer de ceux des banques ou des services de transfert de fonds.",
        ],
      },
      {
        heading: "10. Suspension et fermeture",
        paragraphs: [
          "Nous pouvons suspendre ou retirer des comptes, des rôles, des annonces ou des accès si les présentes conditions ne sont pas respectées, ou pour protéger les utilisateurs ou la plateforme. Vous pouvez cesser d'utiliser Biqbaq à tout moment.",
        ],
      },
      {
        heading: "11. Exclusions et responsabilité",
        paragraphs: [
          "Biqbaq est fourni tel quel. Dans la mesure permise par la loi, nous ne garantissons ni les vendeurs, ni les concessionnaires, ni les annonces, ni un service ininterrompu, et nous ne sommes pas responsables des pertes indirectes ni des rapports entre utilisateurs. Rien ici ne limite les droits que vous confère la loi sur la protection du consommateur.",
        ],
      },
      {
        heading: "12. Modifications et droit applicable",
        paragraphs: [
          "Nous pouvons mettre à jour les présentes conditions et publierons la nouvelle version avec sa date. Elles sont régies par les lois de l'Ontario et les lois fédérales du Canada qui s'y appliquent.",
        ],
      },
      {
        heading: "13. Coordonnées",
        paragraphs: ["Vous pouvez envoyer vos questions à support@biqbaq.com."],
      },
    ],
  },
  privacy: {
    title: "Avis de confidentialité",
    updated: "Dernière mise à jour : 14 novembre 2026",
    intro:
      "Le présent avis explique comment Biqbaq (« nous ») recueille, utilise et communique les renseignements personnels lorsque vous utilisez biqbaq.com. Biqbaq est exploité par un particulier établi en Ontario, au Canada, et traite les renseignements personnels conformément aux lois canadiennes sur la protection de la vie privée, notamment la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE).",
    sections: [
      {
        heading: "1. Renseignements recueillis",
        paragraphs: [
          "Compte : votre nom, votre adresse courriel et votre mot de passe (conservé uniquement sous forme brouillée) ou, si vous vous connectez avec Google, les renseignements décrits à la section 2.",
          "Vendeurs et concessionnaires : renseignements sur la boutique ou l'entreprise, coordonnées, renseignements de versement détenus par notre fournisseur de paiement et, pour la vérification, pièces d'identité ou preuves à l'appui.",
          "Activité : annonces, photos, messages, avis, favoris, commentaires, billets de blogue, demandes de rôle et parrainages. Si vous contactez un vendeur sans compte, nous traitons votre nom, votre adresse courriel et votre message.",
          "Commandes : ce que vous avez commandé, auprès de qui, les montants, les renseignements de livraison que vous fournissez et les références de paiement. Les données de carte sont saisies directement auprès de Stripe, notre fournisseur de paiement; nous ne voyons ni ne conservons jamais votre numéro de carte complet.",
          "Courriels et notifications : si vous vous inscrivez à une liste d'envoi, votre adresse courriel, votre langue et la date de votre accord; si vous activez les notifications sur téléphone, l'adresse de notification du navigateur de votre appareil.",
          "Données techniques : renseignements sur l'appareil et l'utilisation, comme l'adresse IP, le type de navigateur, les pages consultées et le nombre de vues des annonces, utilisés pour exploiter, protéger et améliorer le site.",
        ],
      },
      {
        heading: "2. Connexion avec Google",
        paragraphs: [
          "Si vous choisissez de vous connecter avec Google, Google nous communique votre nom, votre adresse courriel et votre photo de profil, avec votre autorisation. Nous ne recevons pas votre mot de passe Google et nous ne demandons pas l'accès à Gmail, à vos contacts, à votre agenda, à Drive ni à aucune autre donnée Google.",
          "Nous utilisons ces renseignements uniquement pour créer votre compte Biqbaq et vous connecter. Nous ne les vendons pas, ne les utilisons pas à des fins publicitaires et ne les communiquons à personne d'autre que le fournisseur qui héberge nos comptes (Supabase). Notre utilisation des renseignements reçus de Google respecte la Politique relative aux données des utilisateurs des services d'API Google, y compris ses exigences d'utilisation limitée.",
          "Vous pouvez retirer l'accès de Biqbaq à tout moment dans les paramètres de sécurité de votre compte Google, et demander la suppression de votre compte Biqbaq en écrivant à support@biqbaq.com.",
        ],
      },
      {
        heading: "3. Utilisation",
        paragraphs: [
          "Nous utilisons les renseignements personnels pour gérer votre compte, afficher les annonces, mettre en relation les acheteurs avec les vendeurs et les concessionnaires, traiter les commandes et les paiements, examiner les demandes et vérifier les vendeurs, envoyer des messages de service (comme les courriels de connexion, de commande et de message), prévenir la fraude et les abus, tenir des dossiers, améliorer la plateforme et respecter nos obligations légales.",
          "Nous envoyons des courriels promotionnels uniquement avec votre consentement, comme l'exige la Loi canadienne anti-pourriel, et chacun contient un lien de désabonnement. Un vendeur auprès de qui vous avez acheté ou que vous avez contacté peut vous écrire au sujet de sa boutique par l'entremise de Biqbaq; ces courriels contiennent aussi un lien de désabonnement.",
        ],
      },
      {
        heading: "4. Ce que les autres peuvent voir",
        paragraphs: [
          "Vos annonces publiques, le nom de la boutique, sa ville, son statut de vérification et les avis sont visibles par tous. Les adresses courriel privées des vendeurs ne sont pas affichées sur le site ni dans l'API publique, mais si un vendeur répond à une demande par courriel, le destinataire verra cette adresse.",
        ],
      },
      {
        heading: "5. Communication à des tiers",
        paragraphs: [
          "Nous communiquons des renseignements à l'autre partie à une conversation ou à une commande, ainsi qu'aux fournisseurs qui aident à exploiter Biqbaq, uniquement à cette fin : Render (hébergement du site), Supabase (base de données, comptes et connexion), Cloudinary (photos), Resend (envoi de courriels), Stripe (paiements), FormSubmit (avis des nouvelles inscriptions à la liste d'envoi), Google (connexion, si vous la choisissez) et le service de notifications de votre navigateur (notifications sur téléphone que vous activez). Nous ne vendons pas de renseignements personnels.",
          "Nous pouvons aussi communiquer des renseignements lorsque la loi l'exige ou pour protéger les droits et la sécurité des utilisateurs et du public. Ces fournisseurs peuvent stocker ou traiter des renseignements à l'extérieur du Canada, principalement aux États-Unis, où ils peuvent être consultés en vertu des lois de ce pays.",
        ],
      },
      {
        heading: "6. Documents de vérification",
        paragraphs: [
          "Les pièces d'identité et les preuves sont conservées dans un stockage à accès restreint, sont accessibles uniquement aux examinateurs autorisés, et chaque accès est consigné.",
        ],
      },
      {
        heading: "7. Témoins et stockage du navigateur",
        paragraphs: [
          "Nous utilisons les témoins nécessaires pour vous garder connecté et protéger votre session, ainsi que le stockage du navigateur pour mémoriser vos choix, comme la langue et le thème, et un code de parrainage avec lequel vous arrivez. Nous n'utilisons pas de témoins publicitaires ni de suivi entre sites.",
        ],
      },
      {
        heading: "8. Durée de conservation",
        paragraphs: [
          "Nous conservons les renseignements du compte tant que celui-ci est ouvert, et les autres renseignements seulement le temps nécessaire aux fins ci-dessus. Lorsqu'ils ne sont plus nécessaires, nous les supprimons ou les anonymisons. Les dossiers de commande, de paiement et de facturation sont conservés aussi longtemps que l'exigent les lois canadiennes en matière fiscale et comptable (généralement six ans), et les dossiers des décisions de vérification et les journaux de sécurité peuvent être conservés plus longtemps pour protéger les utilisateurs et la plateforme.",
        ],
      },
      {
        heading: "9. Sécurité",
        paragraphs: [
          "Nous utilisons des mesures de protection adaptées à la sensibilité des renseignements, notamment des connexions chiffrées, des contrôles d'accès et la consignation des actions sensibles. Aucun système n'est totalement sûr : utilisez un mot de passe robuste et signalez-nous tout abus soupçonné.",
        ],
      },
      {
        heading: "10. Vos choix et vos droits",
        paragraphs: [
          "Vous pouvez demander à consulter, à corriger ou à supprimer vos renseignements personnels, ou retirer votre consentement, sous réserve des limites légales, en écrivant à support@biqbaq.com. Nous répondons dans un délai de 30 jours. Vous pouvez vous désabonner de toute liste d'envoi au moyen du lien figurant dans ses courriels, et modifier vos paramètres de notification dans votre compte.",
          "Si notre réponse ne vous satisfait pas, vous pouvez porter plainte auprès du Commissariat à la protection de la vie privée du Canada.",
        ],
      },
      {
        heading: "11. Âge",
        paragraphs: [
          "Biqbaq s'adresse aux personnes de 18 ans et plus. Nous ne recueillons pas sciemment de renseignements personnels auprès de personnes de moins de 18 ans, et nous les supprimons si nous apprenons que nous l'avons fait.",
        ],
      },
      {
        heading: "12. Modifications",
        paragraphs: ["Nous pouvons mettre à jour le présent avis et publierons la nouvelle version sur cette page avec sa date."],
      },
      {
        heading: "13. Coordonnées",
        paragraphs: ["Les questions, demandes et plaintes concernant la vie privée peuvent être envoyées au responsable de la protection de la vie privée de Biqbaq, à support@biqbaq.com."],
      },
    ],
  },
};

export function getLegalDocument(locale: string, document: keyof LegalContent): LegalDocument {
  return (locale === "fr" ? fr : en)[document];
}
