import { IconWindowDownload } from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { BrandTile } from "@/features/sources";
import { Intro } from "@/shared/components/intro";
import styles from "./styles.module.css";

const ROWS: ReadonlyArray<{
  id: number;
  source: Source;
  title: number;
  progress: number;
}> = [
  { id: 1, source: "youtube", title: 64, progress: 64 },
  { id: 2, source: "tiktok", title: 48, progress: 100 },
  { id: 3, source: "vimeo", title: 72, progress: 18 },
  { id: 4, source: "instagram", title: 56, progress: 0 },
];

function Status({ progress }: { progress: number }) {
  if (progress === 100) {
    return <Intro.Label tone="faint">Done</Intro.Label>;
  }
  if (progress === 0) {
    return <Intro.Label tone="faint">Queued</Intro.Label>;
  }
  return (
    <span className={styles.track}>
      <span className={styles.fill} style={{ width: `${progress}%` }} />
    </span>
  );
}

/** A still of the queue with the download dialog open over it. */
export function DownloadsPreview() {
  return (
    <Intro.Preview>
      <Intro.Window>
        <Intro.Heading icon={<IconWindowDownload size={12} />}>
          Downloads
        </Intro.Heading>
        <span className={styles.rows}>
          {ROWS.map((row) => (
            <span key={row.id} className={styles.row}>
              <BrandTile source={row.source} size={14} />
              <Intro.Bar width={row.title} tone="strong" />
              <Status progress={row.progress} />
            </span>
          ))}
        </span>
      </Intro.Window>
      <Intro.Card elevation="raised" className={styles.dialog}>
        <Intro.Label>Download Video or Audio</Intro.Label>
        <span className={styles.field}>
          <BrandTile source="youtube" size={12} />
          <Intro.Label tone="faint">youtube.com/watch?v=VvINNQ</Intro.Label>
        </span>
        <span className={styles.actions}>
          <Intro.Pill>Audio</Intro.Pill>
          <Intro.Pill variant="solid">Download</Intro.Pill>
        </span>
      </Intro.Card>
    </Intro.Preview>
  );
}
