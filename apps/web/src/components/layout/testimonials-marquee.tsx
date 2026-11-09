"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type CSSProperties } from "react";
import { testimonialsSlide, type Testimonial } from "@/modules/testimonials";

function Card({ testimonial }: { testimonial: Testimonial }) {
  return (
    <figure className="flex w-72 shrink-0 flex-col justify-between gap-5 rounded-3xl bg-card p-6 shadow-sm sm:w-80">
      <blockquote className="text-sm font-medium leading-relaxed sm:text-base">&ldquo;{testimonial.quote}&rdquo;</blockquote>
      <figcaption className="flex items-center gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-bold text-white">
          {testimonial.name.trim().charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 text-sm">
          <span className="block truncate font-semibold">{testimonial.name}</span>
          {testimonial.city && <span className="block truncate text-muted-foreground">{testimonial.city}</span>}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * With more than three quotes, they slide from right to left across the screen, without end
 * (owner's choice). They stop while a visitor points at or taps them, or with the pause
 * button, and never move for visitors who ask for reduced motion: then the row scrolls by
 * hand. Up to three sit still, side by side.
 */
export function TestimonialsMarquee({ testimonials }: { testimonials: Testimonial[] }) {
  const t = useTranslations("home");
  const [paused, setPaused] = useState(false);
  // About eight seconds a card, so the speed stays readable however many there are.
  const style = { "--testimonials-duration": `${testimonials.length * 8}s` } as CSSProperties;

  if (!testimonials.length) return null;
  if (!testimonialsSlide(testimonials.length)) {
    return (
      <ul aria-label={t("testimonialsTitle")} className="flex flex-wrap gap-4">
        {testimonials.map((testimonial) => (
          <li key={testimonial.id} className="flex">
            <Card testimonial={testimonial} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="grid gap-3">
      <div
        className="testimonials-marquee -mx-4 overflow-hidden px-4 py-2 sm:-mx-6 sm:px-6"
        data-paused={paused || undefined}
        onClick={() => setPaused((value) => !value)}
      >
        {/* No padding on the row itself: sliding by exactly half of it must land on the copy. */}
        <div className="testimonials-track flex w-max gap-4" style={style}>
          {/* Read once by screen readers; the copies only keep the row moving without a gap. */}
          <ul aria-label={t("testimonialsTitle")} className="flex gap-4">
            {testimonials.map((testimonial) => (
              <li key={testimonial.id} className="flex">
                <Card testimonial={testimonial} />
              </li>
            ))}
          </ul>
          <div aria-hidden inert className="testimonials-copies flex gap-4">
            {/* Four cards or more are wider than the page, so one copy loops without a gap. */}
            {testimonials.map((testimonial) => (
              <Card key={`copy-${testimonial.id}`} testimonial={testimonial} />
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
        className="testimonials-toggle inline-flex h-9 w-fit items-center gap-2 justify-self-end rounded-full border border-border bg-card px-3 text-xs font-semibold hover:bg-muted"
      >
        {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
        {paused ? t("testimonialsPlay") : t("testimonialsPause")}
      </button>
    </div>
  );
}
