import { IconChevronDown } from "@pond/icons";
import { ease, mix, progress } from "@pond/video";
import { STATES, state } from "../data";
import { CUES } from "../timeline";
import styles from "./styles.module.css";

const WIDTH = 1180;
const ZOOM = 1.25;
const TOP = 215;

/** The Download Lab: every state of the real dialog, open at once. */
export function Lab({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.labIn, 900));
  const away = ease.inOut(progress(t, CUES.labOut, 420));
  if (t < CUES.labIn - 20 || away >= 1) {
    return null;
  }

  const push = ease.inOut(progress(t, CUES.rooms, CUES.labOut - CUES.rooms));

  return (
    <div
      className={styles.stage}
      style={{
        left: (1920 - WIDTH * ZOOM) / 2,
        top: TOP,
        width: WIDTH * ZOOM,
        opacity: Math.min(1, rise * 2) * (1 - away),
        transform: `translateY(${(1 - rise) * 80}px) scale(${mix(1, 1.05, push) * mix(1, 0.97, away)})`,
        filter: away > 0.01 ? `blur(${away * 8}px)` : undefined,
      }}
    >
      <div
        className={styles.lab}
        style={{ width: WIDTH, transform: `scale(${ZOOM})` }}
      >
        <header className={styles.header}>
          <h1 className={styles.title}>Download Dialog</h1>
          <div className={styles.filters}>
            <span className={styles.filter}>
              All Components 30
              <IconChevronDown size={12} />
            </span>
            <span className={styles.filter}>
              All States 30
              <IconChevronDown size={12} />
            </span>
          </div>
        </header>
        <div className={styles.grid}>
          {STATES.map((item, index) => {
            const at = CUES.rooms + index * CUES.roomStep;
            const k = ease.outQuint(progress(t, at, 600));
            return (
              <figure
                key={item.id}
                className={styles.entry}
                style={{
                  opacity: Math.min(1, k * 1.6),
                  transform: `translateY(${(1 - k) * 20}px) scale(${mix(0.95, 1, k)})`,
                }}
              >
                <figcaption className={styles.label}>
                  {item.component}
                </figcaption>
                <div className={styles.room}>
                  <img alt="" className={styles.shot} src={state(item.id)} />
                </div>
              </figure>
            );
          })}
        </div>
      </div>
    </div>
  );
}
