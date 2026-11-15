import { PageTransition } from "@/components/layout/page-transition";
import { SiteExtras } from "@/components/layout/site-extras";
import type { LegalDocument } from "@/content/legal";

export async function LegalPage({ locale, document }: { locale: string; document: LegalDocument }) {
  return (
    <PageTransition>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <article className="mx-auto max-w-3xl">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{document.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{document.updated}</p>
        <p className="mt-6 text-lg">{document.intro}</p>
        {document.sections.map((section) => (
          <section key={section.heading} className="mt-8">
            <h2 className="font-heading text-xl font-bold">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-2 leading-relaxed text-muted-foreground">
                {paragraph}
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
