"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProductImage } from "@/modules/product-catalog";

export function ProductGallery({ images }: { images: ProductImage[] }) {
  const t = useTranslations("productDetail");
  const [selected, setSelected] = useState(0);
  const current = images[selected];

  if (!current) return <div className="aspect-square rounded-xl bg-muted" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        <Image src={current.url} alt={current.alt} fill preload sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              aria-label={t("viewImage", { number: index + 1 })}
              aria-current={index === selected}
              onClick={() => setSelected(index)}
              className={cn(
                "relative size-16 overflow-hidden rounded-lg border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-20",
                index === selected ? "border-brand-red" : "border-transparent opacity-80 hover:opacity-100",
              )}
            >
              <Image src={image.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
