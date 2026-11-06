import { ArrowUpRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { productPhotoName, SharedPhoto } from "@/components/layout/page-transition";
import { reveal } from "@/components/layout/reveal";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/modules/product-catalog";
import { SellerBadge } from "./seller-badge";
import { ViewCount } from "./view-count";

export function ProductCard({
  product,
  delay = 0,
  compact = false,
}: {
  product: Product;
  delay?: number;
  compact?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const image = product.images[0];
  const soldOut = product.availability === "out_of_stock";

  return (
    <article className="group relative flex h-full flex-col gap-2 rounded-2xl focus-within:ring-2 focus-within:ring-ring">
      <SharedPhoto name={productPhotoName(product.slug)}>
      <div {...reveal("fade", delay)} className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
        {image && (
          <Image
            src={image.url}
            alt={image.alt}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none"
          />
        )}
        {product.availability !== "in_stock" && (
          <span className="absolute top-2 left-2 rounded-full bg-background/95 px-2.5 py-0.5 text-xs font-semibold">
            {t(`availability.${product.availability}`)}
          </span>
        )}
        {/* Keeps the photo clickable mid-reveal, when the title's overlay is confined to its own box. */}
        <Link href={`/products/${product.slug}`} tabIndex={-1} aria-hidden className="absolute inset-0" />
      </div>
      </SharedPhoto>
      <div
        {...reveal("rise", delay + 200)}
        className="flex flex-1 items-start gap-2 rounded-2xl bg-card p-3 shadow-sm transition-shadow group-hover:shadow-md"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold">
            {/* The link covers the whole card through the ::after overlay. */}
            <Link href={`/products/${product.slug}`} className="outline-none after:absolute after:inset-0">
              {product.name}
            </Link>
          </h3>
          <p className={soldOut ? "font-bold text-muted-foreground" : "font-bold"}>
            {formatPrice(product.price, locale)}
          </p>
          <div className="mt-1 text-xs text-muted-foreground">
            <p className="truncate">
              {/* Sits above the card's overlay, so it opens the seller rather than the product. */}
              <Link href={`/sellers/${product.seller.slug}`} className="relative z-10 hover:text-foreground hover:underline">
                {product.seller.name}
              </Link>
            </p>
            <p className="truncate">
              {t("seller.location", { city: product.seller.city, country: t(`markets.${product.seller.country}`) })}
            </p>
          </div>
          <SellerBadge verified={product.seller.verified} className="mt-0.5" />
          <ViewCount count={product.views} className="mt-0.5" />
        </div>
        {/* Narrow cards need the room for the product details. */}
        {!compact && (
          <span
            aria-hidden
            className="hidden size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors group-hover:bg-brand-red group-hover:text-brand-red-foreground sm:flex"
          >
            <ArrowUpRight className="size-4" />
          </span>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({
  products,
  className,
  compact = false,
}: {
  products: Product[];
  className?: string;
  compact?: boolean;
}) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4", className)}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} delay={(index % 4) * 80} compact={compact} />
        </li>
      ))}
    </ul>
  );
}
