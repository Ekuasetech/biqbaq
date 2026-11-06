import { Ban, CalendarDays, MapPin, MoveRight, Package } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { carPhotoName, PageTransition } from "@/components/layout/page-transition";
import { SiteExtras } from "@/components/layout/site-extras";
import { ContactForm } from "@/components/product/contact-form";
import { ProductGallery } from "@/components/product/product-gallery";
import { SellerBadge } from "@/components/product/seller-badge";
import { ShareButtons } from "@/components/product/share-buttons";
import { ViewCount } from "@/components/product/view-count";
import { CargoVehicleCard } from "@/components/vehicle/cargo-vehicle-card";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  getCargoVehicleBySlug,
  listCargoVehicleSlugs,
  listRelatedCargoVehicles,
} from "@/modules/vehicle-marketplace";

type Props = PageProps<"/[locale]/cargo-cars/[slug]">;

// Opts out of instant-navigation validation: this page reads its params outside
// Suspense, so it may block on navigation, like the single product page.
export const instant = false;

export async function generateStaticParams() {
  const slugs = await listCargoVehicleSlugs();
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const vehicle = await getCargoVehicleBySlug(slug);
  if (!vehicle) return {};
  const t = await getTranslations({ locale, namespace: "cargoCars" });
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  return {
    title: name,
    description: t("metaDescription", { name, origin: vehicle.origin, destination: vehicle.destination }),
  };
}

export default async function CargoVehiclePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const vehicle = await getCargoVehicleBySlug(slug);
  if (!vehicle) notFound();

  const t = await getTranslations({ locale });
  const related = await listRelatedCargoVehicles(vehicle, 4);
  const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  const departure = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(vehicle.estimatedDeparture));

  return (
    <PageTransition>
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <nav aria-label={t("productDetail.breadcrumbLabel")} className="mb-4 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/cargo-cars" className="hover:text-foreground">
              {t("cargoCars.title")}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page">{name}</li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <ProductGallery images={vehicle.images} photoName={carPhotoName(vehicle.slug)} />

        <div className="flex flex-col gap-5">
          <div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-balance">{name}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 text-2xl font-bold">
              {vehicle.origin}
              <MoveRight className="size-6 text-brand-red" aria-label={t("cargoCars.to")} />
              {vehicle.destination}
            </p>
            <p className="mt-2 text-sm font-medium">{t(`cargoCars.status.${vehicle.status}`)}</p>
            <ViewCount count={vehicle.views} className="mt-1" />
          </div>

          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold">{t("cargoCars.tripDetails")}</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="flex gap-2">
                <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-xs text-muted-foreground">{t("cargoCars.departureLabel")}</dt>
                  <dd className="text-sm font-medium">{departure}</dd>
                </div>
              </div>
              <div className="flex gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <dt className="text-xs text-muted-foreground">{t("cargoCars.goingTo")}</dt>
                  <dd className="text-sm font-medium">{vehicle.destination}, Nigeria</dd>
                </div>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex-1">
                  <dt className="text-xs text-muted-foreground">{t("cargoCars.spaceLabel")}</dt>
                  <dd className="text-sm font-medium">{t("cargoCars.space", { percent: vehicle.availableSpacePercent })}</dd>
                  <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand-red" style={{ width: `${vehicle.availableSpacePercent}%` }} />
                  </div>
                </div>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{t("cargoCars.estimateNote")}</p>
          </div>

          <div className="rounded-2xl bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{t("cargoCars.dealer")}</p>
            <p className="font-semibold">{vehicle.dealer.name}</p>
            <SellerBadge verified={vehicle.dealer.verified} className="mt-1" />
          </div>

          <ShareButtons title={name} />
        </div>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="contact-title">
          <h2 id="contact-title" className="font-heading text-2xl font-bold tracking-tight">
            {t("cargoCars.contactTitle")}
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("cargoCars.contactIntro")}</p>
          <ContactForm />
        </section>

        <section aria-labelledby="restrictions-title">
          <h2 id="restrictions-title" className="font-heading text-2xl font-bold tracking-tight">
            {t("cargoCars.restrictions")}
          </h2>
          <ul className="mt-3 grid gap-2">
            {vehicle.restrictions.map((restriction) => (
              <li key={restriction} className="flex items-start gap-2 text-sm">
                <Ban className="mt-0.5 size-4 shrink-0 text-brand-red" aria-hidden />
                {restriction}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-12" aria-labelledby="related-title">
        <h2 id="related-title" className="mb-4 font-heading text-2xl font-bold tracking-tight">
          {t("cargoCars.related")}
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {related.map((other, index) => (
            <li key={other.id}>
              <CargoVehicleCard vehicle={other} delay={index * 80} />
            </li>
          ))}
        </ul>
      </section>

      <SiteExtras locale={locale} />
    </div>
    </PageTransition>
  );
}
