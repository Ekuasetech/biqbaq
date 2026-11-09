import { ArrowRight, ArrowUpRight, ShoppingBag, UserPlus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Image from "next/image";
import { Suspense, type ReactNode } from "react";
import { AdsSection, AdsSkeleton } from "@/components/advertising/ads-section";
import { BlogSection } from "@/components/blog/blog-section";
import { HeroHeadline, HeroSlideshow, HeroSlidesProvider } from "@/components/layout/hero-slideshow";
import { PageTransition } from "@/components/layout/page-transition";
import { reveal, RevealWords } from "@/components/layout/reveal";
import { ProductGrid } from "@/components/product/product-card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { CargoVehicleCard } from "@/components/vehicle/cargo-vehicle-card";
import { CATEGORY_SLUGS, listFeaturedProducts } from "@/modules/product-catalog";
import { listCargoVehicles } from "@/modules/vehicle-marketplace";

const photo = (seed: string, width: number, height = width) =>
  `https://picsum.photos/seed/biqbaq-${seed}/${width}/${height}`;

const categoryHref = (category: string) => ({ pathname: "/products", query: { category } });

function SectionHeading({ title, id, action }: { title: string; id: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4">
      <h2 id={id} className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
        <RevealWords text={title} />
      </h2>
      {action}
    </div>
  );
}

function ViewAll({ label, query }: { label: string; query?: Record<string, string> }) {
  return (
    <Link
      {...reveal("rise", 150)}
      href={{ pathname: "/products", query }}
      className="flex shrink-0 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
    >
      {label}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale });
  const products = await listFeaturedProducts(6);
  const cargoVehicles = await listCargoVehicles(4);
  // The "In the spotlight" section was removed at the owner's request (2026-11-08).
  const grid = products.slice(0, 6);

  const banners = [
    // The "free website after referrals" tile was removed, as no website is offered (Q-17).
    // Three even tiles, each with one of the site's own photos (owner asked for a tidier row).
    { key: "banner1", href: "/register", image: "/hero/toronto-professional.jpg", className: "bg-brand-navy text-white" },
    { key: "banner3", href: "/products", image: "/hero/nigeria-seller.jpg", className: "bg-card text-foreground shadow-sm" },
    { key: "banner4", href: "/cargo-cars", image: "/hero/sienna-cargo.jpg", className: "bg-[oklch(0.2_0.07_262)] text-white" },
  ] as const;

  const faqs = ["1", "2", "3", "4", "5"] as const;

  // Cargo Cars is a separate kind of listing (PRD §8), not a product category,
  // so it has its own page rather than a category filter.
  const shopCards = [
    ...CATEGORY_SLUGS.map((slug) => ({
      key: slug as string,
      label: t(`categories.${slug}`),
      href: categoryHref(slug) as string | ReturnType<typeof categoryHref>,
    })),
    { key: "cargo-cars", label: t("cargoCars.title"), href: "/cargo-cars" },
  ];

  return (
    <PageTransition>
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      {/* Hero */}
      <section>
        <HeroSlidesProvider>
        <div className="grid items-center gap-8 pt-6 sm:pt-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p
              {...reveal("rise", 350)}
              className="inline-flex rounded-full bg-card px-3.5 py-1.5 text-xs font-semibold tracking-wide shadow-sm"
            >
              {t("home.eyebrow")}
            </p>
            <HeroHeadline />
            <p {...reveal("rise", 850)} className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              {t("home.subtitle")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                {...reveal("rise", 1050)}
                href="/products"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-colors hover:bg-brand-red hover:text-brand-red-foreground"
              >
                <ShoppingBag className="size-4" aria-hidden />
                {t("home.browse")}
              </Link>
              <Link
                {...reveal("rise", 1150)}
                href="/register"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-red px-6 text-sm font-bold text-brand-red-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
              >
                <UserPlus className="size-4" aria-hidden />
                {t("home.createAccount")}
              </Link>
            </div>
          </div>
          <div {...reveal("fade", 600)} className="relative aspect-[5/4] w-full">
            <HeroSlideshow />
          </div>
        </div>
        </HeroSlidesProvider>
      </section>

      {/* Categories */}
      <section className="pt-12" aria-labelledby="categories-title">
        <SectionHeading id="categories-title" title={t("home.categoriesTitle")} action={<ViewAll label={t("home.allCategories")} />} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shopCards.map(({ key, label, href }, index) => (
            <li key={key} {...reveal("rise", index * 80)}>
              <Link
                href={href}
                className="group relative flex h-32 flex-col overflow-hidden rounded-2xl bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="relative z-10 text-sm font-bold">{label}</span>
                <span className="absolute -right-3 -bottom-3 size-20 overflow-hidden rounded-2xl">
                  <Image
                    src={photo(`category-${key}`, 200)}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transform-none"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Products */}
      <section className="pt-14" aria-labelledby="products-title">
        <SectionHeading id="products-title" title={t("home.featuredTitle")} action={<ViewAll label={t("home.viewAll")} />} />
        <ul {...reveal("rise", 100)} className="mb-5 flex flex-wrap gap-2">
          <li>
            <span className="inline-block rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground">
              {t("products.allCategories")}
            </span>
          </li>
          {CATEGORY_SLUGS.map((slug) => (
            <li key={slug}>
              <Link
                href={{ pathname: "/products", query: { category: slug } }}
                className="inline-block rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-card"
              >
                {t(`categories.${slug}`)}
              </Link>
            </li>
          ))}
        </ul>
        {grid.length > 0 ? (
          <ProductGrid products={grid} className="lg:grid-cols-6" compact />
        ) : (
          <p className="text-muted-foreground">{t("home.noProductsYet")}</p>
        )}
      </section>

      {/* Cargo cars going to Nigeria */}
      <section className="pt-14" aria-labelledby="cargo-title">
        <SectionHeading
          id="cargo-title"
          title={t("cargoCars.sectionTitle")}
          action={
            <Link
              {...reveal("rise", 150)}
              href="/cargo-cars"
              className="flex shrink-0 items-center gap-1 text-sm font-semibold underline-offset-4 hover:underline"
            >
              {t("home.viewAll")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        />
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {cargoVehicles.map((vehicle, index) => (
            <li key={vehicle.id}>
              <CargoVehicleCard vehicle={vehicle} delay={index * 80} />
            </li>
          ))}
        </ul>
      </section>

      <BlogSection locale={locale} />

      {/* Ads posted by Super Admin */}
      <Suspense fallback={<AdsSkeleton />}>
        <AdsSection locale={locale} placement="homepage" />
      </Suspense>

      {/* Promotional tiles */}
      <section className="pt-14" aria-label={t("home.promotionsLabel")}>
        <ul className="grid gap-4 md:grid-cols-3">
          {banners.map(({ key, href, image, className }, index) => (
            <li key={key} {...reveal("panel", index * 90)} className={cn("overflow-hidden rounded-3xl", className)}>
              <Link href={href} className="group flex h-full flex-col gap-5 p-5 sm:p-6">
                <span className="relative block aspect-[16/10] w-full overflow-hidden rounded-2xl">
                  <Image
                    src={image}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 400px, (min-width: 768px) 30vw, 90vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="block text-xs font-bold tracking-widest uppercase opacity-80">{t(`home.${key}Eyebrow`)}</span>
                  <span className="mt-2 block font-heading text-2xl leading-tight font-extrabold text-balance">{t(`home.${key}Title`)}</span>
                  {/* Pushed to the bottom, so the three links line up whatever the title's length. */}
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold underline-offset-4 group-hover:underline">
                    {t(`home.${key}Cta`)}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Testimonials: placeholder content until there are real ones. */}
      <section className="pt-14" aria-labelledby="testimonials-title">
        <SectionHeading id="testimonials-title" title={t("home.testimonialsTitle")} />
        <p {...reveal("rise")} className="-mt-3 mb-5 text-sm text-muted-foreground">{t("home.placeholderNote")}</p>
        <ul className="grid items-center gap-4 lg:grid-cols-[1fr_1.2fr_1fr]">
          {(["1", "2", "3"] as const).map((n, index) => {
            const featured = n === "2";
            return (
              <li
                key={n}
                {...reveal("rise", [150, 0, 300][index])}
                className={cn(
                  "flex flex-col gap-6 rounded-3xl p-6",
                  featured ? "bg-brand-navy py-10 text-white shadow-xl" : "bg-card shadow-sm",
                )}
              >
                <p className={cn("font-medium", featured && "text-lg")}>{t("home.testimonialBody")}</p>
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full text-sm font-bold",
                      featured ? "bg-brand-red text-brand-red-foreground" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {n}
                  </span>
                  <p className="text-sm font-semibold">{t("home.testimonialAuthor", { n })}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* FAQ: placeholder wording, describing only behaviour the PRD confirms. */}
      <section className="grid gap-8 pt-14 lg:grid-cols-[1fr_2fr]" aria-labelledby="faq-title">
        <div>
          <h2 id="faq-title" className="font-heading text-3xl font-extrabold tracking-tight">
            <RevealWords text={t("home.faqTitle")} />
          </h2>
          <p {...reveal("rise", 150)} className="mt-2 text-sm text-muted-foreground">{t("home.placeholderNote")}</p>
          <div {...reveal("rise", 300)} className="mt-5 rounded-3xl bg-card p-5 shadow-sm">
            <p className="font-bold">{t("home.faqMoreTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("home.faqMoreBody")}</p>
            <Link
              href="/products"
              className="mt-4 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-brand-red hover:text-brand-red-foreground"
            >
              {t("home.browse")}
            </Link>
          </div>
        </div>
        <div className="grid content-start gap-3">
          {faqs.map((n, index) => (
            <details key={n} open={index === 0} {...reveal("rise", index * 110)} className="group rounded-2xl bg-card shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl p-5 font-semibold [&::-webkit-details-marker]:hidden">
                {t(`home.faq${n}Q`)}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted transition-transform group-open:rotate-90">
                  <ArrowUpRight className="size-4" aria-hidden />
                </span>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{t(`home.faq${n}A`)}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
    </PageTransition>
  );
}
