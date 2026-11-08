import { CalendarDays, MoveRight, Package } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { carPhotoName, SharedPhoto } from "@/components/layout/page-transition";
import { reveal } from "@/components/layout/reveal";
import { SellerBadge } from "@/components/product/seller-badge";
import { ViewCount } from "@/components/product/view-count";
import { Link } from "@/i18n/navigation";
import type { CargoVehicle } from "@/modules/vehicle-marketplace";

export function CargoVehicleCard({ vehicle, delay = 0 }: { vehicle: CargoVehicle; delay?: number }) {
  const locale = useLocale();
  const t = useTranslations("cargoCars");
  const image = vehicle.images[0];
  const href = `/cargo-cars/${vehicle.slug}`;
  const departure = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(vehicle.estimatedDeparture));

  return (
    <article className="group relative flex h-full flex-col gap-2 rounded-2xl focus-within:ring-2 focus-within:ring-ring">
      <SharedPhoto name={carPhotoName(vehicle.slug)}>
      <div {...reveal("fade", delay)} className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
        {image && (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none"
          />
        )}
        {/* Keeps the photo clickable mid-reveal, when the title's overlay is confined to its own box. */}
        <Link href={href} tabIndex={-1} aria-hidden className="absolute inset-0" />
      </div>
      </SharedPhoto>
      <div {...reveal("rise", delay + 200)} className="flex flex-1 flex-col gap-1.5 rounded-2xl bg-card p-3 shadow-sm transition-shadow group-hover:shadow-md">
        <h3 className="text-sm leading-snug font-semibold">
          {/* The link covers the whole card, photo included, through the ::after overlay. */}
          <Link href={href} className="outline-none after:absolute after:inset-0">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </Link>
        </h3>
        <p className="flex flex-wrap items-center gap-x-1.5 font-bold">
          {vehicle.origin}
          <MoveRight className="size-4 text-brand-red" aria-label={t("to")} />
          {vehicle.destination}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          {t("departs", { date: departure })}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Package className="size-3.5 shrink-0" aria-hidden />
          {t("space", { kg: vehicle.availableKg })}
        </p>
        <div className="mt-auto pt-1 text-xs text-muted-foreground">
          <p className="truncate">{vehicle.dealer.name}</p>
          <SellerBadge verified={vehicle.dealer.verified} className="mt-0.5 flex" />
          <ViewCount count={vehicle.views} className="mt-0.5 flex" />
        </div>
      </div>
    </article>
  );
}
