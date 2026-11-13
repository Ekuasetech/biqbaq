import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { InvitedReviewForm } from "@/components/reviews/invited-review-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { reviewTokenSchema } from "@/modules/shop-reviews";

type Props = PageProps<"/[locale]/review/[token]">;

export const instant = false;

// Review links are private and made at any time, so none is built ahead; the framework still
// needs one sample to build the route.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale, token: "__none__" }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "invitedReview" });
  // A private link: kept out of search results.
  return { title: t("title"), robots: { index: false, follow: false } };
}

/** The page a seller's one-time review link opens (Q-67). */
export default async function InvitedReviewPage({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  return (
    <PageTransition>
      <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl bg-card p-6 shadow-sm sm:p-8">
          <Suspense fallback={<Skeleton className="h-80 rounded-2xl" />}>
            <InviteContent locale={locale} token={token} />
          </Suspense>
        </div>
      </div>
    </PageTransition>
  );
}

async function InviteContent({ locale, token }: { locale: string; token: string }) {
  // Each visit asks afresh whether the link still works.
  await connection();
  const t = await getTranslations({ locale, namespace: "invitedReview" });
  const valid = reviewTokenSchema.safeParse(token);
  const found = valid.success ? await getSupabaseAdminClient().rpc("lookup_review_invite", { p_token: valid.data }) : null;
  const invite = (found?.data as { state: string; shop_name: string; shop_slug: string; buyer_name: string }[] | null)?.[0] ?? null;

  if (!invite) return <p role="alert">{t("states.missing")}</p>;
  if (invite.state !== "open") {
    return (
      <div className="grid gap-3">
        <h1 className="font-heading text-2xl font-extrabold">{t(`states.${invite.state}Title`)}</h1>
        <p className="text-muted-foreground">{t(`states.${invite.state}`, { shop: invite.shop_name })}</p>
        <Link href={`/sellers/${invite.shop_slug}`} className="w-fit font-semibold text-brand-red underline underline-offset-4">{t("seeShop", { shop: invite.shop_name })}</Link>
      </div>
    );
  }
  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-semibold text-brand-red">{t("eyebrow")}</p>
        <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight">{t("heading", { shop: invite.shop_name })}</h1>
        <p className="mt-2 text-muted-foreground">{t("intro", { name: invite.buyer_name, shop: invite.shop_name })}</p>
      </div>
      <InvitedReviewForm token={valid.data!} shopName={invite.shop_name} shopSlug={invite.shop_slug} buyerName={invite.buyer_name} />
    </div>
  );
}
