import { IconMagnifier, IconSparkle } from "@pond/icons";
import type { ReactNode } from "react";
import { Art } from "../../../demo";
import type { ArtKind } from "../../../demo";
import styles from "./styles.module.css";

const MATCHES = [
  {
    title: "Sunset over the bay",
    kind: "sunset",
    score: "94%",
  },
  {
    title: "Mountain trail",
    kind: "mountain",
    score: "86%",
  },
  {
    title: "Spring palette",
    kind: "swatch",
    score: "71%",
  },
] as const;

const RENAMED = [
  { title: "Harbor at Dawn", kind: "sunset", file: "IMG_4821.jpg" },
  { title: "Trail Above the Valley", kind: "mountain", file: "IMG_4790.jpg" },
  { title: "Studio Tour Walkthrough", kind: "video", file: "VID_0192.mov" },
  {
    title: "Spring Color Palette",
    kind: "swatch",
    file: "Screenshot 2026-04-02.png",
  },
] as const;

export function Thumb({ kind }: { kind: ArtKind }) {
  return (
    <span className={styles.media}>
      <Art kind={kind} size="slot" />
    </span>
  );
}

export function Score({ children }: { children: ReactNode }) {
  return <span className={styles.score}>{children}</span>;
}

export function SearchPalette() {
  return (
    <span className={styles.palette}>
      <span className={styles.field}>
        <IconMagnifier size={12} />
        golden hour
        <span className={styles.caret} />
      </span>
      <span className={styles.results}>
        {MATCHES.map(({ title, kind, score }, index) => (
          <span
            key={title}
            className={styles.row}
            data-active={index === 0 || undefined}
          >
            <Thumb kind={kind} />
            <span className={styles.name}>{title}</span>
            <Score>{score}</Score>
          </span>
        ))}
      </span>
    </span>
  );
}

export function TitlesPalette() {
  return (
    <span className={styles.palette}>
      <span className={styles.results}>
        {RENAMED.map(({ title, kind, file }, index) => (
          <span
            key={file}
            className={styles.row}
            data-active={index === 0 || undefined}
          >
            <Thumb kind={kind} />
            <span className={styles.lines}>
              <span className={styles.name}>
                {title}
                <IconSparkle size={10} className={styles.accent} />
              </span>
              <span className={styles.filename}>{file}</span>
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
