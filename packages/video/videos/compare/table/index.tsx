import { IconCheck, IconXmark } from "@pond/icons";
import { Logo } from "@pond/ui/logo";
import { ease, envelope, mix, progress, styled } from "@pond/video";
import { type Mark, RIVALS, ROWS } from "../data";
import { CUES, end, rowAt } from "../timeline";
import styles from "./styles.module.css";

const LEFT = 140;
const TOP = 150;
const LABEL = 540;
const COLUMN = 220;
const HEAD = 150;
const ROW = 76;
const BODY = TOP + HEAD;
const CARD_PAD = 12;
const NEVER = Number.POSITIVE_INFINITY;

const columnX = (index: number) => LEFT + LABEL + index * COLUMN;
const POND = RIVALS.length;

function pop(t: number, at: number, duration = 520) {
  const k = ease.outBack(progress(t, at, duration));
  return {
    opacity: ease.out(progress(t, at, 260)),
    transform: `scale(${mix(0.55, 1, k)})`,
    visibility: t < at ? ("hidden" as const) : undefined,
  };
}

function Glyph({ mark, pond }: { mark: Mark; pond?: boolean }) {
  if (mark === "partly") return <span className={styles.partly}>Partly</span>;
  if (mark === "no")
    return (
      <span className={styles.no}>
        <IconXmark size={24} strokeWidth={2} />
      </span>
    );
  if (mark !== "yes")
    return (
      <span className={styles.text} data-pond={pond || undefined}>
        {mark.text}
      </span>
    );
  if (pond)
    return (
      <span className={styles.badge}>
        <IconCheck size={22} strokeWidth={2.75} />
      </span>
    );
  return (
    <span className={styles.yes}>
      <IconCheck size={30} strokeWidth={2.25} />
    </span>
  );
}

/** The comparison grid: rival logos, then one row per bar, with Pond's column filling in last. */
export function Table({ t }: { t: number }) {
  const exit = end("table") - 500;
  if (t < CUES.tableRise - 50 || t > exit + 600) return null;
  const scene = envelope(t, CUES.tableRise, exit, {
    duration: 900,
    rise: 40,
    out: 500,
  });
  const verdict = ease.inOut(progress(t, CUES.verdict, 700));
  const rivalOpacity = mix(1, 0.3, verdict);
  const card = ease.outQuint(progress(t, CUES.pondHead - 150, 1000));
  const bottom = BODY + ROWS.length * ROW;

  return (
    <div className={styles.table} style={styled(scene)}>
      <div
        className={styles.card}
        style={{
          left: columnX(POND) + CARD_PAD / 2,
          top: TOP - CARD_PAD,
          width: COLUMN - CARD_PAD,
          height: bottom - TOP + CARD_PAD * 2,
          opacity: ease.out(progress(t, CUES.pondHead - 150, 400)),
          clipPath: `inset(0 0 ${(1 - card) * 100}% 0 round 22px)`,
        }}
      />
      {RIVALS.map((rival, index) => {
        const at = CUES.heads + index * CUES.headStep;
        return (
          <div
            key={rival.id}
            className={styles.head}
            style={{
              left: columnX(index),
              top: TOP,
              width: COLUMN,
              height: HEAD,
              opacity: rivalOpacity,
            }}
          >
            <img
              className={styles.logo}
              src={rival.logo}
              alt=""
              style={pop(t, at)}
            />
            <span
              className={styles.name}
              style={{ opacity: ease.out(progress(t, at + 120, 400)) }}
            >
              {rival.name}
            </span>
          </div>
        );
      })}
      <div
        className={styles.head}
        style={{ left: columnX(POND), top: TOP, width: COLUMN, height: HEAD }}
      >
        <span className={styles.mark} style={pop(t, CUES.pondHead, 640)}>
          <Logo size={64} aria-hidden />
        </span>
        <span
          className={styles.name}
          data-pond
          style={{ opacity: ease.out(progress(t, CUES.pondHead + 140, 400)) }}
        >
          Pond
        </span>
      </div>
      {ROWS.map((row, index) => {
        const at = rowAt(index);
        const top = BODY + index * ROW;
        const line = ease.inOut(progress(t, at - 100, 700));
        const label = envelope(t, at, NEVER, { rise: 12 });
        const pondAt = at + CUES.pondCell;
        const ring = progress(t, pondAt + 60, 650);
        return (
          <div key={row.label}>
            <div
              className={styles.rule}
              style={{
                left: LEFT,
                top: top + ROW,
                width: columnX(POND) - LEFT,
                transform: `scaleX(${line})`,
              }}
            />
            <span
              className={styles.label}
              style={{
                left: LEFT,
                top,
                width: LABEL,
                height: ROW,
                ...styled(label),
              }}
            >
              {row.label}
            </span>
            {row.rivals.map((mark, column) => {
              const cellAt = at + CUES.cellLead + column * CUES.cellStep;
              return (
                <span
                  key={RIVALS[column]?.id}
                  className={styles.cell}
                  style={{
                    left: columnX(column),
                    top,
                    width: COLUMN,
                    height: ROW,
                    opacity: rivalOpacity,
                  }}
                >
                  <span className={styles.glyph} style={pop(t, cellAt)}>
                    <Glyph mark={mark} />
                  </span>
                </span>
              );
            })}
            <span
              className={styles.cell}
              style={{ left: columnX(POND), top, width: COLUMN, height: ROW }}
            >
              {ring > 0 && ring < 1 ? (
                <span
                  className={styles.ring}
                  style={{
                    opacity: 0.5 * (1 - ring),
                    transform: `scale(${mix(0.8, 1.9, ease.out(ring))})`,
                  }}
                />
              ) : null}
              <span className={styles.glyph} style={pop(t, pondAt, 600)}>
                <Glyph mark={row.pond} pond />
              </span>
            </span>
          </div>
        );
      })}
      <span
        className={styles.note}
        style={{
          top: bottom + 52,
          opacity: ease.out(progress(t, rowAt(0), 700)) * rivalOpacity,
        }}
      >
        Checked against each app's own site, November 2026.
      </span>
    </div>
  );
}
