import { IconFolder, IconNodes3, IconPlus } from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { BrandTile } from "@/features/sources/components/sync-monitor-source-tile";
import { Intro } from "@/shared/components/intro";
import styles from "./styles.module.css";

const ROWS: ReadonlyArray<{
  name: string;
  source: Source;
  kind: string;
  status: string;
}> = [
  { name: "Instagram", source: "instagram", kind: "Account", status: "Synced" },
  { name: "Are.na", source: "arena", kind: "Watch", status: "Synced" },
  { name: "Screenshots", source: "local", kind: "Folder", status: "Fetching" },
  { name: "YouTube", source: "youtube", kind: "Watch", status: "Synced" },
];

/** A still of the sources list with the New Source menu open over it. */
export function SourcesPreview() {
  return (
    <Intro.Preview>
      <Intro.Window>
        <Intro.Heading icon={<IconNodes3 size={12} />}>Sources</Intro.Heading>
        <span className={styles.rows}>
          {ROWS.map((row) => (
            <span key={row.name} className={styles.row}>
              <BrandTile source={row.source} size={14} />
              <Intro.Label>{row.name}</Intro.Label>
              <Intro.Label tone="faint">{row.kind}</Intro.Label>
              <Intro.Label tone="faint">{row.status}</Intro.Label>
            </span>
          ))}
        </span>
      </Intro.Window>
      <Intro.Card elevation="raised" className={styles.menu}>
        <span className={styles.item}>
          <IconPlus size={12} />
          <Intro.Label>New Source</Intro.Label>
        </span>
        <span className={styles.item} data-active="">
          <IconPlus size={12} />
          <Intro.Label>New Watch</Intro.Label>
        </span>
        <span className={styles.item}>
          <IconFolder size={12} />
          <Intro.Label>New Folder</Intro.Label>
        </span>
      </Intro.Card>
    </Intro.Preview>
  );
}
