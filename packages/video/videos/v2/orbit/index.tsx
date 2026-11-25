import { ease, mix, progress } from "@pond/video";
import { ORBIT, SOURCES, SUBSTACK } from "../data";
import { HERO } from "../substack";
import styles from "./styles.module.css";

const CENTER = { x: 960, y: 540 };

interface OrbitProps {
  t: number;
  enter: number;
  step: number;
  exit: number;
  /** When Substack's tile leaves its spot for the Overview hero. */
  fly: number;
}

/** The source tiles burst out of stage center and drift around the line; Substack's carries on. */
export function Orbit({ t, enter, step, exit, fly }: OrbitProps) {
  if (t < enter - 50 || t > fly + 900) return null;
  return (
    <div className={styles.orbit}>
      {SOURCES.map((source, i) => {
        const spot = ORBIT[i];
        if (!spot) return null;
        const at = enter + i * step;
        const out = ease.outQuint(progress(t, at, 1000));
        const land = ease.outBack(progress(t, at, 900));
        const drift = Math.sin((t - at) / 760 + i * 1.7) * 9 * out;
        const named = ease.out(progress(t, at + 300, 400));
        const hero = i === SUBSTACK;
        const carry = hero ? ease.inOut(progress(t, fly, 820)) : 0;
        const leave = hero ? 0 : ease.in(progress(t, exit + i * 45, 520));
        if (hero && carry >= 1) return null;
        const spread = out * (1 + leave * 0.18);
        const size = mix(spot.size, HERO.size, carry);
        const x = mix(spot.x * spread, HERO.x - CENTER.x, carry);
        const y = mix(spot.y * spread + drift, HERO.y - CENTER.y, carry);
        const blur = (1 - out) * 10 + leave * 10;
        return (
          <span
            key={source.name}
            className={styles.spot}
            style={{
              opacity: Math.min(1, out * 2) * (1 - leave),
              transform: `translate(${x}px, ${y}px) rotate(${spot.turn * out * (1 - carry)}deg) scale(${mix(0.3, 1, land) * mix(1, 0.9, leave)})`,
              filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
              zIndex: hero ? 2 : undefined,
            }}
          >
            <span className={styles.tile} style={{ width: size, height: size }}>
              <source.Icon aria-hidden />
            </span>
            <span
              className={styles.name}
              style={{
                opacity: named * (1 - ease.out(progress(t, fly, 240))),
                top: size / 2 + 14,
              }}
            >
              {source.name}
            </span>
          </span>
        );
      })}
    </div>
  );
}
