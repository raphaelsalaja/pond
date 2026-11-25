import { IconArrowUp, IconCheck } from "@pond/icons";
import { Button } from "@pond/ui/button";
import { Logo } from "@pond/ui/logo";
import { ease, mix, progress } from "@pond/video";
import { PROMPT, SEARCHES } from "../data";
import { CUES } from "../timeline";
import styles from "./styles.module.css";

const WIDTH = 600;
const ZOOM = 1.7;

/** The request, then one Pond MCP search per part of the brief. */
export function Prompt({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.composerIn, 900));
  const away = ease.inOut(progress(t, CUES.promptOut, 420));
  if (t < CUES.composerIn - 20 || away >= 1) return null;

  const typed = Math.round(
    PROMPT.length * progress(t, CUES.typeStart, CUES.typeLength),
  );
  const sent = t >= CUES.send;
  const lift = ease.inOut(progress(t, CUES.send, 500));

  return (
    <div
      className={styles.stage}
      style={{
        left: (1920 - WIDTH * ZOOM) / 2,
        top: mix(440, 330, lift),
        width: WIDTH * ZOOM,
        opacity: Math.min(1, rise * 2) * (1 - away),
        transform: `translateY(${(1 - rise) * 60 - away * 40}px)`,
        filter: away > 0.01 ? `blur(${away * 8}px)` : undefined,
      }}
    >
      <div
        className={styles.prompt}
        style={{ width: WIDTH, transform: `scale(${ZOOM})` }}
      >
        <div className={styles.field}>
          <span className={styles.draft}>
            {PROMPT.slice(0, typed)}
            {!sent && <span className={styles.caret} />}
          </span>
          <Button
            icon
            size="xs"
            aria-label="Send"
            disabled={typed < PROMPT.length}
            style={{
              scale: t >= CUES.send - 60 && t < CUES.send + 60 ? 0.94 : 1,
            }}
          >
            <IconArrowUp size={14} />
          </Button>
        </div>
        <ul
          className={styles.calls}
          style={{ opacity: ease.out(progress(t, CUES.search - 80, 300)) }}
        >
          {SEARCHES.map((search, index) => {
            const at = CUES.search + index * CUES.searchStep;
            const show = ease.outQuint(progress(t, at, 420));
            const done = t >= at + CUES.searchDone;
            return (
              <li
                key={search.query}
                className={styles.call}
                style={{
                  opacity: show,
                  transform: `translateY(${(1 - show) * 8}px)`,
                }}
              >
                <Logo size={16} aria-hidden />
                <span className={styles.tool}>search_library</span>
                <span className={styles.query}>“{search.query}”</span>
                <span className={styles.result} data-done={done || undefined}>
                  {done ? (
                    <>
                      {search.saves} saves
                      <IconCheck size={12} />
                    </>
                  ) : (
                    "Searching"
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
