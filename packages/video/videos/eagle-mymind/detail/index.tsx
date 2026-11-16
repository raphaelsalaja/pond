import {
  IconCheck,
  IconChevronRight,
  IconFolder,
  IconGlobe,
  IconStar,
} from "@pond/icons";
import { ease, envelope, progress, styled } from "@pond/video";
import type { ReactNode } from "react";
import { DETAIL, media } from "../data";
import { CUES, end, start } from "../timeline";
import styles from "./styles.module.css";

interface Property {
  label: string;
  value: ReactNode;
}

const PROPERTIES: Property[] = [
  {
    label: "Folder",
    value: (
      <span className={styles.inline}>
        <IconFolder size={20} style={{ color: "var(--ds-orange)" }} />
        Fashion
        <IconChevronRight size={12} className={styles.dim} />
        Runway
      </span>
    ),
  },
  {
    label: "Tags",
    value: (
      <span className={styles.inline}>
        {DETAIL.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
      </span>
    ),
  },
  {
    label: "Rating",
    value: (
      <span className={styles.stars}>
        {[0, 1, 2, 3, 4].map((index) => (
          <IconStar key={index} size={20} />
        ))}
      </span>
    ),
  },
  {
    label: "Colors",
    value: (
      <span className={styles.inline}>
        {DETAIL.colors.map((color) => (
          <span
            key={color}
            className={styles.swatch}
            style={{ background: color }}
          />
        ))}
      </span>
    ),
  },
  {
    label: "Source",
    value: (
      <span className={styles.inline}>
        <IconGlobe size={18} className={styles.dim} />
        {DETAIL.url}
      </span>
    ),
  },
  { label: "Annotation", value: DETAIL.note },
  {
    label: "Dimensions",
    value: <span className={styles.mono}>1066 × 1600</span>,
  },
];

/** One imported save, laid out like a detail panel: the image, then every property Eagle had. */
export function Detail({ t }: { t: number }) {
  const enter = start("detail") + 150;
  const exit = end("detail") - 300;
  if (t < enter - 50 || t > exit + 400) return null;
  const e = envelope(t, enter, exit, { duration: 800, rise: 40 });
  return (
    <div className={styles.panel} style={styled(e)}>
      <header className={styles.header}>
        <span className={styles.crumbs}>
          <IconFolder size={18} style={{ color: "var(--ds-orange)" }} />
          Fashion
          <IconChevronRight size={10} className={styles.dim} />
          Runway
          <IconChevronRight size={10} className={styles.dim} />
          <span className={styles.current}>{DETAIL.title}</span>
        </span>
      </header>
      <div className={styles.body}>
        <img className={styles.image} src={media(DETAIL.id)} alt="" />
        <div className={styles.info}>
          <h2 className={styles.title}>{DETAIL.title}</h2>
          <p className={styles.subtitle}>Studio.library · JPG · 470 KB</p>
          <dl className={styles.list}>
            {PROPERTIES.map((property, index) => {
              const at = CUES.detailRow + index * CUES.detailStep;
              const k = ease.outQuint(progress(t, at, 500));
              const tick = ease.out(progress(t, at + 220, 300));
              return (
                <div
                  key={property.label}
                  className={styles.row}
                  style={{
                    opacity: ease.out(progress(t, at, 300)),
                    transform: `translateX(${(1 - k) * 14}px)`,
                  }}
                >
                  <dt className={styles.label}>{property.label}</dt>
                  <dd className={styles.value}>{property.value}</dd>
                  <span
                    className={styles.tick}
                    style={{
                      opacity: tick,
                      transform: `scale(${0.6 + tick * 0.4})`,
                    }}
                  >
                    <IconCheck size={14} />
                  </span>
                </div>
              );
            })}
          </dl>
        </div>
      </div>
    </div>
  );
}
