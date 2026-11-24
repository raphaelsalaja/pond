import { ease, mix, progress } from "@pond/video";
import { BOARD, REFS, ref } from "../data";
import { CUES } from "../timeline";
import styles from "./styles.module.css";

const ZOOM = 1.45;
const LEFT = 230;
const TOP = 250;
const PAN = 520;
const TILE_HEIGHT = 112;

/** The gather board for the download dialog, filling as references land. */
export function Board({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.boardIn, 900));
  const away = ease.inOut(progress(t, CUES.boardOut, 420));
  if (t < CUES.boardIn - 20 || away >= 1) {
    return null;
  }

  const pan = ease.inOut(
    progress(t, CUES.boardPan, CUES.boardOut - CUES.boardPan + 300),
  );
  const last = CUES.tiles + REFS.length * CUES.tileStep + 400;
  const found = Math.round(
    BOARD.total * ease.out(progress(t, CUES.tiles, last - CUES.tiles)),
  );

  return (
    <div
      className={styles.stage}
      style={{
        left: LEFT,
        top: TOP - pan * PAN,
        opacity: Math.min(1, rise * 2) * (1 - away),
        transform: `translateY(${(1 - rise) * 80}px) scale(${mix(1, 0.97, away)})`,
        filter: away > 0.01 ? `blur(${away * 8}px)` : undefined,
      }}
    >
      <div className={styles.board} style={{ transform: `scale(${ZOOM})` }}>
        <header className={styles.header}>
          <h1 className={styles.title}>{BOARD.title}</h1>
          <p className={styles.brief}>{BOARD.brief}</p>
          <p className={styles.status}>
            <span className={styles.dot} />
            Gathering <span className={styles.count}>{found}</span>
          </p>
          <ul className={styles.sources}>
            {BOARD.sources.map((source, index) => (
              <li
                key={source.label}
                className={styles.source}
                style={{
                  opacity: ease.out(progress(t, CUES.tiles + index * 90, 400)),
                }}
              >
                {source.label}
                <span className={styles.count}>{source.count}</span>
              </li>
            ))}
          </ul>
        </header>
        {BOARD.groups.map((group, groupIndex) => (
          <section key={group.title} className={styles.group}>
            <h2 className={styles.heading}>
              <span className={styles.name}>{group.title}</span>
              {group.description}
            </h2>
            <div className={styles.tiles}>
              {REFS.map((item, index) => {
                if (item.group !== groupIndex) {
                  return null;
                }
                const at = CUES.tiles + index * CUES.tileStep;
                const k = ease.outQuint(progress(t, at, 560));
                return (
                  <img
                    key={item.id}
                    alt=""
                    className={styles.tile}
                    src={ref(item.id)}
                    style={{
                      width:
                        TILE_HEIGHT * Math.min(1.9, Math.max(0.8, item.aspect)),
                      height: TILE_HEIGHT,
                      opacity: Math.min(1, k * 1.6),
                      transform: `translateY(${(1 - k) * 18}px) scale(${mix(0.94, 1, k)})`,
                    }}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
