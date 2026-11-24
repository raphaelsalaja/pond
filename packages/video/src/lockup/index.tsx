import { Logo } from "@pond/ui/logo";
import { useLayoutEffect, useRef, useState } from "react";
import { ease, mix, progress } from "../motion";
import styles from "./styles.module.css";

const SIZE = 92;
const GAP = 26;
const HOLD = 1300;
const SLIDE = 560;
/** The mark starts growing in before the beat so it has settled when the score lands. */
const LEAD = 200;
const FADE = 700;
/** Time from `enter` to the end of the cut; the last `FADE` ms dissolve to white. */
export const LOCKUP_LENGTH = 4400;
/** When the mark starts sliding aside, relative to `enter`, for the slide sound. */
export const LOCKUP_SLIDE = HOLD;

/** Pond's end card: the mark grows in out of a blur, then slides aside as the name resolves beside it. */
export function Lockup({ t, enter }: { t: number; enter: number }) {
  const name = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const measured = name.current?.offsetWidth ?? 0;
    if (measured !== width) {
      setWidth(measured);
    }
  }, [t, enter, width]);
  const at = enter + HOLD;
  const p = progress(t, at, SLIDE);
  const slide = ease.inOut(p);
  const smear = Math.sin(Math.PI * p) * 9;
  const reveal = ease.out(progress(t, at + 120, 700));
  const ink = ease.inOut(progress(t, at + 160, 900));
  const tone = Math.round(mix(205, 17, ink));
  const shift = ((width + GAP) / 2) * slide;
  const rise = ease.outQuint(progress(t, enter - LEAD, 1100));
  const fade = ease.out(progress(t, enter - LEAD, 450));
  const blur = (1 - rise) * 14;
  const gone = ease.inOut(progress(t, enter + LOCKUP_LENGTH - FADE, FADE - 40));

  return (
    <div
      className={styles.lockup}
      style={{
        visibility: t < enter - LEAD ? "hidden" : undefined,
        opacity: 1 - gone,
      }}
    >
      <svg aria-hidden className={styles.defs}>
        <filter id="lockup-smear" x="-50%" y="0" width="200%" height="100%">
          <feGaussianBlur stdDeviation={`${smear} 0`} />
        </filter>
      </svg>
      <span
        className={styles.mark}
        style={{
          opacity: fade,
          transform: `translateX(${-shift}px) scale(${mix(0.72, 1, rise)})`,
          filter:
            [
              blur > 0.1 ? `blur(${blur}px)` : "",
              smear > 0.2 ? "url(#lockup-smear)" : "",
            ]
              .join(" ")
              .trim() || undefined,
        }}
      >
        <Logo size={SIZE} aria-hidden />
      </span>
      <span
        ref={name}
        className={styles.name}
        style={{
          left: `calc(50% + ${SIZE / 2 + GAP - shift}px)`,
          color: `rgb(${tone} ${tone} ${tone})`,
          opacity: reveal,
          filter: reveal < 0.99 ? `blur(${(1 - reveal) * 6}px)` : undefined,
          transform: `translateX(${(1 - reveal) * -28}px)`,
        }}
      >
        Pond
      </span>
    </div>
  );
}
