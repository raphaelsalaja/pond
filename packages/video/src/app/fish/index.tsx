import { useId } from "react";
import { scatter } from "../../motion";
import {
  EYE_PATHS,
  type FishFace,
  type FishSpecies,
  HEART_PATH,
  SPECIES_ART,
  type SpeciesArt,
} from "./art";
import styles from "./styles.module.css";

export type { FishFace, FishSpecies } from "./art";

export type FishColor =
  | "orange"
  | "gold"
  | "teal"
  | "red"
  | "purple"
  | "blue"
  | "green"
  | "pink";

interface FishProps {
  t: number;
  species: FishSpecies;
  color: FishColor;
  size?: number;
  face?: FishFace;
  /** Swims in place, as a fish does while it works. */
  busy?: boolean;
  /** Hearts float up beside it. */
  pleased?: boolean;
  /** Offsets every loop so a school never wobbles in step. */
  seed?: number;
}

const wave = (t: number, period: number, phase = 0) =>
  Math.sin((t / period) * Math.PI * 2 + phase);

/** A fish mark with its wobble, float, blink, and hearts driven by `t` instead of CSS keyframes. */
export function Fish({
  t,
  species,
  color,
  size = 24,
  face = "neutral",
  busy = false,
  pleased = false,
  seed = 0,
}: FishProps) {
  const clip = `fish-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const art: SpeciesArt = SPECIES_ART[species];
  const phase = scatter(seed) * Math.PI * 2;
  const float = wave(t, 3600, phase) * -0.6;
  const swim = busy ? wave(t, 1200, phase) * 4 : 0;
  const blinkAt = (t + scatter(seed + 7) * 4800) % 4800;
  const lid =
    face === "happy"
      ? 1
      : 1 - 0.9 * Math.max(0, 1 - Math.abs(blinkAt - 4608) / 190);
  const lobes = art.lobes.map(([cx, cy, r], index) => {
    const s = 0.995 + wave(t, busy ? 1400 : 3600, phase + index * 1.9) * 0.055;
    return (
      <circle
        key={`${cx}-${cy}`}
        cx={cx}
        cy={cy}
        r={r}
        transform={`translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`}
      />
    );
  });
  const heart = (delay: number) => {
    const k = ((t + delay) % 2400) / 2400;
    const opacity = k < 0.2 ? k / 0.2 : k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    return {
      opacity: pleased ? opacity : 0,
      transform: `translate(${k * 0.6}px, ${1 - k * 4.5}px) scale(${0.6 + Math.min(1, k * 5) * 0.4})`,
    };
  };
  return (
    <span
      className={styles.fish}
      style={{
        width: size,
        height: size,
        color: `var(--ds-${color})`,
      }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <g
          transform={`translate(0 ${float}) rotate(${swim} 12 12)`}
          fill="currentColor"
        >
          {lobes}
          {art.fins ? <path d={art.fins} /> : null}
          {art.stripes ? (
            <>
              <clipPath id={clip}>{lobes}</clipPath>
              <path d={art.stripes} fill="#fff" clipPath={`url(#${clip})`} />
            </>
          ) : null}
          {art.strokes ? (
            <path
              d={art.strokes}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.9"
              strokeLinecap="round"
            />
          ) : null}
          {art.bulb ? (
            <circle cx={art.bulb[0]} cy={art.bulb[1]} r="1.3" opacity={0.85} />
          ) : null}
          {art.eyes.map(([x, y]) => (
            <g
              key={`${x}-${y}`}
              transform={`translate(${x} ${y}) scale(${art.eyeScale}) scale(1 ${lid})`}
            >
              <path d={EYE_PATHS[face]} fill="#fff" />
            </g>
          ))}
        </g>
        <g transform="translate(19.6 4.2)">
          <path className={styles.heart} d={HEART_PATH} style={heart(0)} />
        </g>
        <g transform="translate(22.4 7.4) scale(0.75)">
          <path className={styles.heart} d={HEART_PATH} style={heart(800)} />
        </g>
      </svg>
    </span>
  );
}
