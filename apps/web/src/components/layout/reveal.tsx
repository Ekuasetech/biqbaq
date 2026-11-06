import { Fragment, type CSSProperties } from "react";

export type RevealKind = "rise" | "fade" | "panel" | "pop";

/** Spread onto an element to animate it in. The delay is in milliseconds. */
export function reveal(kind: RevealKind, delay = 0) {
  return {
    "data-rv": kind,
    style: { "--rv-delay": `${delay}ms` } as CSSProperties,
    // RevealObserver may mark an element as shown before React hydrates it.
    suppressHydrationWarning: true,
  };
}

/** Reveals text one word at a time. Screen readers still get the plain sentence. */
export function RevealWords({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split(" ").map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span className="inline-block" {...reveal("rise", delay + index * 70)}>
            {word}
          </span>{" "}
        </Fragment>
      ))}
    </>
  );
}
