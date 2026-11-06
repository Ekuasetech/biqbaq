// DRAFT legal text for lawyer review, written from what the PRD says the platform
// does. Bracketed text marks details the owner must supply. Do not remove the
// draft banner or the noindex setting until the text is approved.

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: LegalSection[];
}

type LegalContent = Record<"conditions" | "privacy", LegalDocument>;

const en: LegalContent = {
  conditions: {
    title: "Conditions of Use",
    intro:
      "These Conditions of Use apply when you use Biqbaq, a marketplace operated by [legal company name]. By using Biqbaq, you agree to them.",
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
          "You must be at least [minimum age] to create an account. Give accurate information, keep your password secure, and tell us if you think someone else has used your account.",
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
          "Where online payment is available for a seller, it is processed by a third-party payment provider and paid to the seller's connected account. The provider's own terms also apply. [Refund, chargeback and commission terms to be added once decided.]",
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
          "Biqbaq is provided as is. To the extent the law allows, we do not guarantee sellers, dealers, listings or uninterrupted service, and we are not liable for indirect losses or for dealings between users. Nothing here limits rights you have under consumer protection law. [Liability wording to be confirmed by a lawyer.]",
        ],
      },
      {
        heading: "12. Changes and governing law",
        paragraphs: [
          "We may update these Conditions, and will post the new version with its date. These Conditions are governed by the laws of [province] and the federal laws of Canada that apply there.",
        ],
      },
      {
        heading: "13. Contact",
        paragraphs: ["Questions about these Conditions can be sent to [contact email], or [mailing address]."],
      },
    ],
  },
  privacy: {
    title: "Privacy Notice",
    intro:
      "This Privacy Notice explains how [legal company name] collects, uses and shares personal information when you use Biqbaq. We aim to handle it in line with Canadian privacy law.",
    sections: [
      {
        heading: "1. Information we collect",
        paragraphs: [
          "Account: your name, email address and sign-in details, including basic profile details from Google if you sign in with Google.",
          "Sellers and dealers: business details, contact information and, for verification, identity documents or supporting evidence.",
          "Activity: listings, messages, reviews, favourites, blog posts, role applications and referrals. If you contact a seller without an account, we process your name, email address and message.",
          "Orders: order details and payment references. Card details are handled by the payment provider. [Confirm once the provider is chosen.]",
          "Technical: device and usage information such as IP address, pages viewed and listing view counts, and browser storage or cookies that remember choices like language and theme.",
        ],
      },
      {
        heading: "2. How we use it",
        paragraphs: [
          "We use personal information to run your account, show listings, connect buyers with sellers and dealers, review applications and verify sellers, send service messages, process payments, prevent fraud and abuse, keep records, improve the platform, and meet legal obligations.",
          "We ask for your consent where the law requires it, including for promotional messages.",
        ],
      },
      {
        heading: "3. What others can see",
        paragraphs: [
          "Your public listings, seller name, city, verification status and reviews can be seen by anyone. Private seller email addresses are not shown on the site or in the public API, but if a seller replies to an enquiry by email, the person receiving it will see that address.",
        ],
      },
      {
        heading: "4. Who we share it with",
        paragraphs: [
          "We share information with the other party to a conversation or order, and with service providers who help run Biqbaq: hosting, database and sign-in (Supabase), images (Cloudinary), email (Resend), and payment, identity verification and SMS providers. [Confirm the final list, and whether personal information is ever sold; the intended answer is no.]",
          "We may also share information to comply with the law or protect rights and safety. Some providers may store or process information outside Canada, where it can be subject to local laws. [Confirm locations.]",
        ],
      },
      {
        heading: "5. Verification documents",
        paragraphs: [
          "Identity documents and evidence are kept in restricted storage, are available only to authorised reviewers, and each access is logged.",
        ],
      },
      {
        heading: "6. How long we keep it",
        paragraphs: [
          "We keep personal information only as long as needed for the purposes above or as the law requires. [Retention periods to be added, including for verification documents and messages.]",
        ],
      },
      {
        heading: "7. Security",
        paragraphs: [
          "We use safeguards suited to the sensitivity of the information, including access controls. No system is completely secure, so please use a strong password and tell us about any suspected misuse.",
        ],
      },
      {
        heading: "8. Your choices and rights",
        paragraphs: [
          "You can ask to access or correct your personal information, withdraw consent subject to legal limits, and ask questions about how it is handled. You can also change notification preferences in your account once available.",
          "If you are not satisfied with our response, you may complain to the Office of the Privacy Commissioner of Canada or your provincial privacy regulator.",
        ],
      },
      {
        heading: "9. Children",
        paragraphs: ["Biqbaq is not intended for anyone under [minimum age]."],
      },
      {
        heading: "10. Changes",
        paragraphs: ["We may update this Notice, and will post the new version with its date."],
      },
      {
        heading: "11. Contact",
        paragraphs: ["Our privacy contact is [privacy officer name], at [privacy email], or [mailing address]."],
      },
    ],
  },
};

const fr: LegalContent = {
  conditions: {
    title: "Conditions d'utilisation",
    intro:
      "Les présentes conditions d'utilisation s'appliquent lorsque vous utilisez Biqbaq, un marché exploité par [dénomination légale de l'entreprise]. En utilisant Biqbaq, vous les acceptez.",
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
          "Vous devez avoir au moins [âge minimum] pour créer un compte. Fournissez des renseignements exacts, protégez votre mot de passe et avisez-nous si vous croyez qu'une autre personne a utilisé votre compte.",
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
          "Lorsque le paiement en ligne est offert pour un vendeur, il est traité par un fournisseur de paiement tiers et versé au compte connecté du vendeur. Les conditions du fournisseur s'appliquent également. [Conditions de remboursement, de rétrofacturation et de commission à ajouter une fois décidées.]",
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
          "Biqbaq est fourni tel quel. Dans la mesure permise par la loi, nous ne garantissons ni les vendeurs, ni les concessionnaires, ni les annonces, ni un service ininterrompu, et nous ne sommes pas responsables des pertes indirectes ni des rapports entre utilisateurs. Rien ici ne limite les droits que vous confère la loi sur la protection du consommateur. [Formulation de la responsabilité à confirmer par un avocat.]",
        ],
      },
      {
        heading: "12. Modifications et droit applicable",
        paragraphs: [
          "Nous pouvons mettre à jour les présentes conditions et publierons la nouvelle version avec sa date. Elles sont régies par les lois de [province] et les lois fédérales du Canada qui s'y appliquent.",
        ],
      },
      {
        heading: "13. Coordonnées",
        paragraphs: ["Vous pouvez envoyer vos questions à [courriel de contact] ou à [adresse postale]."],
      },
    ],
  },
  privacy: {
    title: "Avis de confidentialité",
    intro:
      "Le présent avis explique comment [dénomination légale de l'entreprise] recueille, utilise et communique les renseignements personnels lorsque vous utilisez Biqbaq. Nous visons à les traiter conformément aux lois canadiennes sur la protection de la vie privée.",
    sections: [
      {
        heading: "1. Renseignements recueillis",
        paragraphs: [
          "Compte : votre nom, votre adresse courriel et vos renseignements de connexion, y compris les renseignements de profil de base de Google si vous vous connectez avec Google.",
          "Vendeurs et concessionnaires : renseignements sur l'entreprise, coordonnées et, pour la vérification, pièces d'identité ou preuves à l'appui.",
          "Activité : annonces, messages, avis, favoris, billets de blogue, demandes de rôle et parrainages. Si vous contactez un vendeur sans compte, nous traitons votre nom, votre adresse courriel et votre message.",
          "Commandes : détails des commandes et références de paiement. Les données de carte sont traitées par le fournisseur de paiement. [À confirmer une fois le fournisseur choisi.]",
          "Données techniques : renseignements sur l'appareil et l'utilisation, comme l'adresse IP, les pages consultées et le nombre de vues des annonces, ainsi que le stockage du navigateur ou les témoins qui mémorisent vos choix, comme la langue et le thème.",
        ],
      },
      {
        heading: "2. Utilisation",
        paragraphs: [
          "Nous utilisons les renseignements personnels pour gérer votre compte, afficher les annonces, mettre en relation les acheteurs avec les vendeurs et les concessionnaires, examiner les demandes et vérifier les vendeurs, envoyer des messages de service, traiter les paiements, prévenir la fraude et les abus, tenir des dossiers, améliorer la plateforme et respecter nos obligations légales.",
          "Nous demandons votre consentement lorsque la loi l'exige, notamment pour les messages promotionnels.",
        ],
      },
      {
        heading: "3. Ce que les autres peuvent voir",
        paragraphs: [
          "Vos annonces publiques, le nom du vendeur, sa ville, son statut de vérification et les avis sont visibles par tous. Les adresses courriel privées des vendeurs ne sont pas affichées sur le site ni dans l'API publique, mais si un vendeur répond à une demande par courriel, le destinataire verra cette adresse.",
        ],
      },
      {
        heading: "4. Communication à des tiers",
        paragraphs: [
          "Nous communiquons des renseignements à l'autre partie à une conversation ou à une commande, ainsi qu'aux fournisseurs qui aident à exploiter Biqbaq : hébergement, base de données et connexion (Supabase), images (Cloudinary), courriel (Resend) et fournisseurs de paiement, de vérification d'identité et de SMS. [Confirmer la liste finale, et si des renseignements personnels sont vendus; la réponse visée est non.]",
          "Nous pouvons aussi communiquer des renseignements pour respecter la loi ou protéger des droits et la sécurité. Certains fournisseurs peuvent stocker ou traiter des renseignements à l'extérieur du Canada, où ils peuvent être assujettis aux lois locales. [Confirmer les emplacements.]",
        ],
      },
      {
        heading: "5. Documents de vérification",
        paragraphs: [
          "Les pièces d'identité et les preuves sont conservées dans un stockage à accès restreint, sont accessibles uniquement aux examinateurs autorisés, et chaque accès est consigné.",
        ],
      },
      {
        heading: "6. Durée de conservation",
        paragraphs: [
          "Nous conservons les renseignements personnels seulement le temps nécessaire aux fins ci-dessus ou exigé par la loi. [Durées à ajouter, notamment pour les documents de vérification et les messages.]",
        ],
      },
      {
        heading: "7. Sécurité",
        paragraphs: [
          "Nous utilisons des mesures de protection adaptées à la sensibilité des renseignements, y compris des contrôles d'accès. Aucun système n'est totalement sûr : utilisez un mot de passe robuste et signalez-nous tout abus soupçonné.",
        ],
      },
      {
        heading: "8. Vos choix et vos droits",
        paragraphs: [
          "Vous pouvez demander à consulter ou à corriger vos renseignements personnels, retirer votre consentement sous réserve des limites légales et poser des questions sur leur traitement. Vous pourrez aussi modifier vos préférences de notification dans votre compte lorsque cette option sera offerte.",
          "Si notre réponse ne vous satisfait pas, vous pouvez porter plainte auprès du Commissariat à la protection de la vie privée du Canada ou de l'organisme provincial compétent.",
        ],
      },
      {
        heading: "9. Enfants",
        paragraphs: ["Biqbaq n'est pas destiné aux personnes de moins de [âge minimum]."],
      },
      {
        heading: "10. Modifications",
        paragraphs: ["Nous pouvons mettre à jour le présent avis et publierons la nouvelle version avec sa date."],
      },
      {
        heading: "11. Coordonnées",
        paragraphs: ["Notre responsable de la protection de la vie privée est [nom du responsable], joignable à [courriel] ou à [adresse postale]."],
      },
    ],
  },
};

export function getLegalDocument(locale: string, document: keyof LegalContent): LegalDocument {
  return (locale === "fr" ? fr : en)[document];
}
