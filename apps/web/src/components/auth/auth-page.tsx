import Image from "next/image";
import type { ReactNode } from "react";
import { reveal } from "@/components/layout/reveal";
import { SiteExtras } from "@/components/layout/site-extras";

/** The shared layout for account pages: the form beside a photo. */
export function AuthPage({
  locale,
  title,
  subtitle,
  image,
  imageAlt,
  imagePosition = "object-center",
  children,
}: {
  locale: string;
  title: string;
  subtitle: string;
  image: string;
  imageAlt: string;
  imagePosition?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <div {...reveal("rise")} className="rounded-3xl bg-card p-6 shadow-sm sm:p-10">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 mb-6 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
        <div {...reveal("fade", 150)} className="relative hidden min-h-96 overflow-hidden rounded-3xl bg-muted lg:block">
          <Image src={image} alt={imageAlt} fill preload sizes="50vw" className={`object-cover ${imagePosition}`} />
        </div>
      </div>
      <SiteExtras locale={locale} />
    </div>
  );
}
