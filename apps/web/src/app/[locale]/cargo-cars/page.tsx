import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { reveal } from "@/components/layout/reveal";
import { SiteExtras } from "@/components/layout/site-extras";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CargoVehicleCard } from "@/components/vehicle/cargo-vehicle-card";
import { getPathname, Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { filterCargoVehicles, listCargoVehicles, parseCargoFilters } from "@/modules/vehicle-marketplace";

type Props = PageProps<"/[locale]/cargo-cars">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cargoCars" });
  return { title: t("sectionTitle"), description: t("body") };
}

const uniqueSorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

async function Results({ locale, searchParams }: { locale: string; searchParams: Props["searchParams"] }) {
  const t = await getTranslations({ locale, namespace: "cargoCars" });
  const all = await listCargoVehicles();
  const filters = parseCargoFilters(await searchParams, all);
  const vehicles = filterCargoVehicles(all, filters);
  const selectClass =
    "h-10 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <>
      <div className="mt-4 mb-5 flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t("count", { count: vehicles.length })} · {t("soonestFirst")}
        </p>
        {/* A plain GET form, so filtering works without JavaScript and can be shared as a link. */}
        <form action={getPathname({ href: "/cargo-cars", locale })} className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1 text-xs font-medium">
            <label htmlFor="cargo-from">{t("filterFrom")}</label>
            <select id="cargo-from" name="from" defaultValue={filters.from ?? ""} className={selectClass}>
              <option value="">{t("allCities")}</option>
              {uniqueSorted(all.map((vehicle) => vehicle.origin)).map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1 text-xs font-medium">
            <label htmlFor="cargo-to">{t("filterTo")}</label>
            <select id="cargo-to" name="to" defaultValue={filters.to ?? ""} className={selectClass}>
              <option value="">{t("allDestinations")}</option>
              {uniqueSorted(all.map((vehicle) => vehicle.destination)).map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}>
            {t("apply")}
          </button>
        </form>
      </div>

      {vehicles.length > 0 ? (
        <ul aria-label={t("listLabel")} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {vehicles.map((vehicle, index) => (
            <li key={vehicle.id}>
              <CargoVehicleCard vehicle={vehicle} delay={(index % 4) * 80} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyBody")}</p>
          <Link href="/cargo-cars" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-4 h-10")}>
            {t("clearFilters")}
          </Link>
        </div>
      )}
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-14 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
      ))}
    </div>
  );
}

// Lists sample cars until vehicle and shared cargo listings are built (Phase 9).
export default async function CargoCarsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "cargoCars" });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 {...reveal("rise")} className="font-heading text-3xl font-extrabold tracking-tight">
        {t("title")}
      </h1>
      <p {...reveal("rise", 100)} className="mt-2 max-w-2xl text-muted-foreground">
        {t("body")}
      </p>
      <Suspense fallback={<ResultsSkeleton />}>
        <Results locale={locale} searchParams={searchParams} />
      </Suspense>
      <SiteExtras locale={locale} />
    </div>
  );
}
