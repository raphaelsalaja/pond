import {
  IconAlbum2,
  IconArrowDown,
  IconArrowUp,
  IconArrowUpRight,
  IconWindowShare,
} from "@pond/icons";
import { Button, Tray } from "@pond/ui";
import { App, ease, mix, progress, toStage, ZOOM } from "@pond/video";
import { ARTICLE, media, SOURCES, SUBSTACK } from "../data";
import { LibrarySidebar } from "../library";
import { CUES, end } from "../timeline";
import styles from "./styles.module.css";

const SOURCE = SOURCES[SUBSTACK];
const VIEWER = { left: 248, width: 1250 - 248 };
const MEASURE = 560;
const COLUMN_TOP = 44 + 88;
const AVATAR = 36;
/** Title, subtitle, and the gaps above the byline, at the reader's fixed type sizes. */
const AVATAR_TOP = COLUMN_TOP + 34 * 1.2 + 12 + 20 * 1.4 + 12 + 8;

/** The byline avatar, in stage pixels, where the orbiting Substack tile lands. */
export const HERO = (() => {
  const center = toStage(
    VIEWER.left + (VIEWER.width - MEASURE) / 2 + AVATAR / 2,
    AVATAR_TOP + AVATAR / 2,
  );
  return { ...center, size: AVATAR * ZOOM };
})();

/** A Substack post open in Pond's reader, scrolling as you read. */
export function Substack({ t }: { t: number }) {
  const rise = ease.outQuint(progress(t, CUES.substackRise, 1100));
  const away = ease.inOut(progress(t, end("substack") - 650, 600));
  if (t < CUES.substackRise - 50 || away >= 1) return null;

  const landed = t >= CUES.substackFly + 820;
  const scroll = mix(0, 400, ease.inOut(progress(t, CUES.read, 3200)));
  const Logo = SOURCE?.Icon;

  return (
    <App.Window
      look="2.0"
      crumb={{
        icon: <IconAlbum2 size={16} />,
        label: "All",
        trail: ARTICLE.title,
      }}
      style={{
        opacity: Math.min(1, rise * 2) * (1 - away),
        transform: `translateY(${(1 - rise) * 140}px) scale(${mix(0.97, 1, rise) * mix(1, 0.96, away)})`,
        filter: away > 0.01 ? `blur(${away * 10}px)` : undefined,
      }}
    >
      <LibrarySidebar t={t} />
      <div className={styles.reader}>
        <div className={styles.hud}>
          <Tray.Pill className={styles.pill}>
            <Button icon size="sm" variant="ghost" aria-label="Previous Save">
              <IconArrowUp />
            </Button>
            <Button icon size="sm" variant="ghost" aria-label="Next Save">
              <IconArrowDown />
            </Button>
          </Tray.Pill>
          <Tray.Pill className={styles.pill}>
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label="Open on Substack"
            >
              <IconArrowUpRight />
            </Button>
            <Button icon size="sm" variant="ghost" aria-label="Share">
              <IconWindowShare />
            </Button>
          </Tray.Pill>
        </div>
        <article
          className={styles.column}
          style={{ width: MEASURE, transform: `translateY(${-scroll}px)` }}
        >
          <header className={styles.header}>
            <h1 className={styles.title}>{ARTICLE.title}</h1>
            <p className={styles.subtitle}>{ARTICLE.subtitle}</p>
            <div className={styles.byline}>
              <span
                className={styles.avatar}
                style={{ opacity: landed ? 1 : 0 }}
              >
                {Logo ? <Logo aria-hidden /> : null}
              </span>
              <div className={styles.credit}>
                <span className={styles.author}>{ARTICLE.author}</span>
                <span className={styles.facts}>{ARTICLE.facts}</span>
              </div>
            </div>
            <img className={styles.cover} src={media(ARTICLE.cover)} alt="" />
          </header>
          <div className={styles.body}>
            {ARTICLE.body.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <h2>{ARTICLE.heading}</h2>
            {ARTICLE.after.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <img src={media(ARTICLE.figure)} alt="" />
          </div>
        </article>
      </div>
    </App.Window>
  );
}
