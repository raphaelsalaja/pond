import { IconTable } from "@pond/icons";
import { ease, envelope, progress, styled } from "@pond/video";
import { MYMIND, media } from "../data";
import { CUES, end, start } from "../timeline";
import styles from "./styles.module.css";

const PANEL = { left: 110, top: 400, width: 960 };
const HEAD = 58;
const COLUMNS = 46;
const ROW = 70;
const CARDS = { left: 1160, top: 300, height: 156, gap: 22 };

const rowAt = (index: number) => CUES.csvRow + index * CUES.csvStep;

const rowY = (index: number) =>
  PANEL.top + HEAD + COLUMNS + index * ROW + ROW / 2;
const cardY = (index: number) =>
  CARDS.top + index * (CARDS.height + CARDS.gap) + CARDS.height / 2;

/** The mymind export's `cards.csv` on the left, and the Pond saves each row becomes on the right. */
export function Mymind({ t }: { t: number }) {
  const enter = start("mymind") + 200;
  const exit = end("mymind") - 350;
  if (t < enter - 50 || t > exit + 400) return null;
  const e = envelope(t, enter, exit, { duration: 800, rise: 30 });
  return (
    <div className={styles.scene} style={styled(e)}>
      <svg className={styles.wires} width="1920" height="1080" aria-hidden>
        {MYMIND.map((card, index) => {
          const k = ease.inOut(progress(t, rowAt(index) + 120, 420));
          const x1 = PANEL.left + PANEL.width + 10;
          const x2 = CARDS.left - 14;
          const y1 = rowY(index);
          const y2 = cardY(index);
          const mid = (x1 + x2) / 2;
          return (
            <path
              key={card.id}
              d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`}
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - k}
              className={styles.wire}
            />
          );
        })}
      </svg>
      <div
        className={styles.file}
        style={{ left: PANEL.left, top: PANEL.top, width: PANEL.width }}
      >
        <header className={styles.head}>
          <span className={styles.name}>
            <IconTable size={18} />
            cards.csv
          </span>
          <span className={styles.where}>mymind export</span>
        </header>
        <div className={styles.columns}>
          <span>title</span>
          <span>note</span>
          <span>tags</span>
          <span>created</span>
        </div>
        {MYMIND.map((card, index) => {
          const lit = ease.out(progress(t, rowAt(index), 220));
          return (
            <div key={card.id} className={styles.row} style={{ "--lit": lit }}>
              <span className={styles.cell}>{card.title}</span>
              <span className={styles.cell}>{card.note}</span>
              <span className={styles.cell}>{card.tags.join(",")}</span>
              <span className={styles.cell}>{card.created.slice(0, 10)}</span>
            </div>
          );
        })}
      </div>
      {MYMIND.map((card, index) => {
        const at = rowAt(index) + 380;
        const k = ease.outQuint(progress(t, at, 600));
        if (k <= 0) return null;
        return (
          <article
            key={card.id}
            className={styles.save}
            style={{
              left: CARDS.left,
              top: CARDS.top + index * (CARDS.height + CARDS.gap),
              height: CARDS.height,
              opacity: ease.out(progress(t, at, 300)),
              transform: `translateX(${(1 - k) * -40}px)`,
              filter: k < 0.98 ? `blur(${(1 - k) * 6}px)` : undefined,
            }}
          >
            <img className={styles.thumb} src={media(card.media)} alt="" />
            <div className={styles.meta}>
              <span className={styles.title}>{card.title}</span>
              <span className={styles.note}>{card.note}</span>
              <span className={styles.foot}>
                {card.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                  </span>
                ))}
                <span className={styles.date}>{card.shown}</span>
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}
