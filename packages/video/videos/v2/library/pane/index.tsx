import { IconDots, IconExternalLink, IconXmark } from "@pond/icons";
import { Button, Pane as Header, Input, Tabs } from "@pond/ui";
import { ease, progress } from "@pond/video";
import type { CSSProperties } from "react";
import { media, PREVIEW, SOURCES } from "../../data";
import styles from "./styles.module.css";

const SOURCE = SOURCES[0];
const SWATCHES = [
  "#8a4b2a",
  "#b8763f",
  "#3d2a1e",
  "#d9c2a5",
  "#6b5847",
  "#efe8de",
];

/** The 2.0 details pane, floating over the library as an inset card. */
export function Pane({
  t,
  open,
  scroll,
  style,
}: {
  t: number;
  open: number;
  scroll: number;
  style?: CSSProperties;
}) {
  const k = ease.outQuint(progress(t, open, 620));
  if (k <= 0) {
    return null;
  }
  const Logo = SOURCE?.Icon;
  return (
    <Tabs.Root
      value="details"
      render={<section className={styles.pane} />}
      style={{
        opacity: Math.min(1, k * 1.6),
        transform: `translateX(${(1 - k) * 28}px) scale(${0.98 + k * 0.02})`,
        ...style,
      }}
    >
      <Header.Header
        className={styles.header}
        title={
          <Tabs.List aria-label="Details Views">
            <Tabs.Tab value="details">Details</Tabs.Tab>
            <Tabs.Tab value="related">Related</Tabs.Tab>
          </Tabs.List>
        }
      >
        <Button icon size="sm" variant="ghost" aria-label="More">
          <IconDots />
        </Button>
        <Button icon size="sm" variant="ghost" aria-label="Close Details">
          <IconXmark />
        </Button>
      </Header.Header>
      <div className={styles.viewport}>
        <div
          className={styles.body}
          style={{ transform: `translateY(${-scroll}px)` }}
        >
          <figure className={styles.preview}>
            <span className={styles.frame}>
              <img alt="" src={media(PREVIEW.id)} />
              <figcaption>JPG</figcaption>
            </span>
          </figure>
          <div className={styles.colors}>
            {SWATCHES.map((color, index) => (
              <span
                key={color}
                className={styles.swatch}
                style={{
                  background: color,
                  scale: ease.outBack(
                    progress(t, open + 260 + index * 40, 360),
                  ),
                }}
              />
            ))}
          </div>
          <div className={styles.identity}>
            <div className={styles.field}>
              <span className={styles.label}>Name</span>
              <Input.Root size="sm" variant="secondary">
                <Input.Field readOnly value={PREVIEW.title} />
              </Input.Root>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>URL</span>
              <Input.Root size="sm" variant="secondary">
                <Input.Field readOnly value={PREVIEW.url} />
              </Input.Root>
            </div>
          </div>
          <article className={styles.source}>
            <header className={styles.author}>
              <span className={styles.avatar}>SM</span>
              <span className={styles.names}>
                <span className={styles.name}>{PREVIEW.author}</span>
                <span className={styles.handle}>@{PREVIEW.handle}</span>
              </span>
            </header>
            <p className={styles.description}>{PREVIEW.description}</p>
            <footer className={styles.footer}>
              <span className={styles.platform}>
                {Logo ? (
                  <span
                    className={styles.logo}
                    style={{ background: SOURCE?.color }}
                  >
                    <Logo width={10} height={10} />
                  </span>
                ) : null}
                <span>{SOURCE?.name}</span>
                <span aria-hidden>·</span>
                <span>{PREVIEW.date}</span>
              </span>
              <Button size="xs" variant="ghost" className={styles.open}>
                Open
                <IconExternalLink size={12} />
              </Button>
            </footer>
          </article>
          <section className={styles.section}>
            <span className={styles.label}>Tags</span>
            <div className={styles.chips}>
              {PREVIEW.tags.map((tag) => (
                <span key={tag} className={styles.chip}>
                  {tag}
                </span>
              ))}
            </div>
          </section>
          <section className={styles.section}>
            <span className={styles.label}>Folders</span>
            <div className={styles.chips}>
              {PREVIEW.folders.map((folder) => (
                <span key={folder} className={styles.chip}>
                  {folder}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Tabs.Root>
  );
}
