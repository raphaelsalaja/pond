import {
  IconInstagram,
  IconPinterest,
  IconXTwitter,
  IconYoutube,
} from "@pond/icons/social-media";
import type { CSSProperties, ReactNode } from "react";
import { Art } from "../art";
import type { ArtKind } from "../art";
import styles from "./styles.module.css";

interface ProgressStyle extends CSSProperties {
  "--progress": string;
}

const downloads: ReadonlyArray<{
  id: string;
  kind: ArtKind;
  title: string;
  source: string;
  logo: ReactNode;
  status: "progress" | "complete" | "waiting";
  progress: number;
}> = [
  {
    id: "sunset",
    kind: "sunset",
    title: "Sunset over the bay",
    source: "Instagram",
    logo: <IconInstagram />,
    status: "progress",
    progress: 35,
  },
  {
    id: "tour",
    kind: "video",
    title: "Studio tour",
    source: "YouTube",
    logo: <IconYoutube />,
    status: "progress",
    progress: 64,
  },
  {
    id: "trail",
    kind: "mountain",
    title: "Mountain trail",
    source: "Pinterest",
    logo: <IconPinterest />,
    status: "complete",
    progress: 100,
  },
  {
    id: "thread",
    kind: "doc",
    title: "Design systems thread",
    source: "X",
    logo: <IconXTwitter />,
    status: "waiting",
    progress: 0,
  },
  {
    id: "palette",
    kind: "swatch",
    title: "Spring palette",
    source: "Pinterest",
    logo: <IconPinterest />,
    status: "waiting",
    progress: 0,
  },
];
const statusLabel = {
  progress: "Downloading",
  complete: "Complete",
  waiting: "Waiting",
} as const;

export function Downloads() {
  return (
    <div className={styles.table}>
      <span className={styles.header}>
        <span>Name</span>
        <span>Source</span>
        <span>Status</span>
        <span>Progress</span>
      </span>
      {downloads.map((item, index) => {
        const live = index === 0;
        const progressStyle: ProgressStyle = {
          "--progress": `${item.progress}%`,
        };
        return (
          <span
            className={styles.download}
            data-live={live || undefined}
            data-status={item.status}
            key={item.id}
            style={progressStyle}
          >
            <span className={styles.lead}>
              {live ? (
                <span className={styles.slot} />
              ) : (
                <span className={styles.slot}>
                  <Art kind={item.kind} size="slot" />
                </span>
              )}
              <span className={styles.file}>{item.title}</span>
            </span>
            <span className={styles.source}>
              <span className={styles.logo}>{item.logo}</span>
              {item.source}
            </span>
            <span className={styles.status}>
              <span data-status={item.status}>{statusLabel[item.status]}</span>
              {live ? <span data-status="complete">Complete</span> : null}
            </span>
            <span className={styles.track}>
              <span className={styles.fill} />
            </span>
          </span>
        );
      })}
    </div>
  );
}
