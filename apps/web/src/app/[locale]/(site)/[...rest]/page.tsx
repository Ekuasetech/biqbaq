import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

// Sends unknown URLs to the localized not-found page inside the site layout.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale, rest: ["__not-found__"] }));
}

export default function CatchAllPage() {
  notFound();
}
