import type { ReactNode } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { reveal } from "@/components/layout/reveal";

/** The shared layout for account pages: only the form, with no photo, blog or ads. */
export function AuthPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <PageTransition>
      <div className="mx-auto w-full max-w-lg px-4 py-10 sm:py-14">
        <div {...reveal("rise")} className="rounded-3xl bg-card p-6 shadow-sm sm:p-10">
          <h1 className="font-heading text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 mb-6 text-muted-foreground">{subtitle}</p>
          {children}
        </div>
      </div>
    </PageTransition>
  );
}
