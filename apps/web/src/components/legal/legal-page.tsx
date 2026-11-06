import { TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageTransition } from "@/components/layout/page-transition";
import { SiteExtras } from "@/components/layout/site-extras";
import type { LegalDocument } from "@/content/legal";

/** Highlights [bracketed] blanks, so that none can be missed before launch. */
function withBlanksMarked(text: string) {
  return text.split(/(\[[^\]]+\])/).map((part, index) =>
    part.startsWith("[") ? (
      <mark key={index} className="rounded bg-amber-200 px-1 text-amber-950">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

export async function LegalPage({ locale, document }: { locale: string; document: LegalDocument }) {
  const t = await getTranslations({ locale, namespace: "legal" });

  return (
    <PageTransition>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <article className="mx-auto max-w-3xl">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{document.title}</h1>
        <p className="mt-4 flex gap-2 rounded-2xl bg-amber-100 p-4 text-sm font-medium text-amber-950">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("draftNotice")}
        </p>
        <p className="mt-6 text-lg">{withBlanksMarked(document.intro)}</p>
        {document.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="font-heading text-xl font-bold">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-2 leading-relaxed text-muted-foreground">
                {withBlanksMarked(paragraph)}
              </p>
            ))}
          </section>
        ))}
      </article>
      <SiteExtras locale={locale} />
    </div>
    </PageTransition>
  );
}
