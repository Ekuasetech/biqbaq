"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { RevealWords } from "./reveal";

const SLIDE_MS = 5000;
const INTRO_MS = 1300;

// Each photo is paired with the headline shown alongside it.
const SLIDES = [
  { src: "/hero/nigeria-seller.jpg", title: "slideSellerTitle", alt: "slideSellerAlt", position: "object-[65%_center]" },
  { src: "/hero/sienna-cargo.jpg", title: "slideCargoTitle", alt: "slideCargoAlt", position: "object-[45%_center]" },
  { src: "/hero/toronto-professional.jpg", title: "slideTorontoTitle", alt: "slideTorontoAlt", position: "object-center" },
] as const;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

interface HeroSlidesState {
  active: number;
  paused: boolean;
  setPaused: (paused: boolean) => void;
}

const HeroSlidesContext = createContext<HeroSlidesState | null>(null);

function useHeroSlides() {
  const state = useContext(HeroSlidesContext);
  if (!state) throw new Error("Hero components must be inside HeroSlidesProvider");
  return state;
}

/** Keeps the photo and headline in step. Starts paused for reduced-motion users. */
export function HeroSlidesProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(0);
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const isFirstTurn = useRef(true);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const paused = userPaused ?? reducedMotion;

  useEffect(() => {
    if (paused) return;
    // The first photo is still fading in with the hero, so give it extra time.
    const delay = isFirstTurn.current ? SLIDE_MS + INTRO_MS : SLIDE_MS;
    const timer = setTimeout(() => {
      isFirstTurn.current = false;
      setActive((current) => (current + 1) % SLIDES.length);
    }, delay);
    return () => clearTimeout(timer);
  }, [active, paused]);

  return (
    <HeroSlidesContext.Provider value={{ active, paused, setPaused: setUserPaused }}>
      {children}
    </HeroSlidesContext.Provider>
  );
}

/** All headlines share one grid cell, so the tallest sets the height and nothing jumps. */
export function HeroHeadline() {
  const t = useTranslations("home");
  const { active } = useHeroSlides();

  return (
    <h1 className="mt-4 grid font-heading text-4xl leading-[1.08] font-extrabold tracking-tight sm:text-5xl xl:text-6xl">
      {SLIDES.map((slide, index) => (
        <span
          key={slide.title}
          aria-hidden={index !== active}
          className={cn(
            "[grid-area:1/1] transition-opacity duration-[1200ms] ease-in-out motion-reduce:transition-none",
            index === active ? "opacity-100" : "opacity-0",
          )}
        >
          <RevealWords text={t(slide.title)} delay={450} />
        </span>
      ))}
    </h1>
  );
}

export function HeroSlideshow() {
  const t = useTranslations("home");
  const { active, paused, setPaused } = useHeroSlides();

  return (
    <>
      {SLIDES.map((slide, index) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={index === active ? t(slide.alt) : ""}
          aria-hidden={index !== active}
          data-active={index === active || undefined}
          fill
          preload={index === 0}
          sizes="(min-width: 1024px) 45vw, 90vw"
          className={cn(
            "rounded-[1.5rem] object-cover transition-opacity duration-[1200ms] ease-in-out motion-reduce:transition-none",
            slide.position,
            index === active ? "opacity-100" : "opacity-0",
          )}
        />
      ))}
      <button
        type="button"
        aria-label={paused ? t("slidesPlay") : t("slidesPause")}
        onClick={() => setPaused(!paused)}
        className="absolute right-3 bottom-3 flex size-10 items-center justify-center rounded-full bg-black/55 text-white transition-colors outline-none hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white"
      >
        {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
      </button>
    </>
  );
}
