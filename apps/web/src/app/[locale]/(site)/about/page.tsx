import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { notFound } from "next/navigation";
import { RichTextView } from "@/components/blog/rich-text-view";
import { PageTransition } from "@/components/layout/page-transition";
import { aboutDescription, aboutFor } from "@/modules/about";
import { getAboutPage } from "@/modules/about/server";
import { getSiteImages } from "@/modules/site-images/server";

type Props = PageProps<"/[locale]/about">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  const page = await getAboutPage();
  if (!page) return { title: t("title") };
  const text = locale === "fr" && page.text_fr ? page.text_fr : page.text_en;
  return { title: t("title"), description: aboutDescription(text) };
}

/** About us: Super Admin's photo, then the write-up (owner's request, 2026-11-08). */
export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const page = await getAboutPage();
  const doc = page ? aboutFor(page, locale) : null;
  // Not on the site until Super Admin publishes it.
  if (!doc) notFound();
  const t = await getTranslations({ locale, namespace: "about" });
  const photo = (await getSiteImages(locale)).about;

  return (
    <PageTransition>
      <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="relative aspect-[21/9] w-full overflow-hidden rounded-3xl bg-muted">
          <Image src={photo.src} alt={photo.alt ?? ""} fill preload sizes="(min-width: 896px) 896px, 100vw" className="object-cover" />
        </div>
        <h1 className="mt-8 font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">{t("title")}</h1>
        <div className="mx-auto mt-2 max-w-3xl text-base sm:text-lg">
          <RichTextView doc={doc} />
        </div>
      </article>
    </PageTransition>
  );
}
