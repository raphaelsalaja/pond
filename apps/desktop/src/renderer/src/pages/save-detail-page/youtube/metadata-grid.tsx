import { useMemo } from "react";
import { CardSection } from "@/components/save-preview/card-section";
import {
  collectMetadataRows,
  collectPropertyRows,
  type PaneRow,
} from "@/components/save-preview/rows";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

export function MetadataGrid({ save }: { save: Save }) {
  const stats = useMemo(() => collectMetadataRows(save), [save]);
  const props = useMemo(() => collectPropertyRows(save), [save]);

  if (stats.length === 0 && props.length === 0) return null;

  return (
    <div className={styles["metadata-grid"]}>
      {stats.length > 0 ? (
        <CardSection label="Metadata" className={styles["metadata-card"]}>
          <Rows rows={stats} />
        </CardSection>
      ) : null}
      {props.length > 0 ? (
        <CardSection label="Properties" className={styles["metadata-card"]}>
          <Rows rows={props} />
        </CardSection>
      ) : null}
    </div>
  );
}

function Rows({ rows }: { rows: PaneRow[] }) {
  return (
    <div className={styles["row-list"]}>
      {rows.map((row) => (
        <div key={row.id} className={styles.row}>
          <span className={styles["row-icon"]} aria-hidden>
            {row.icon}
          </span>
          <span className={styles["row-label"]}>{row.label}</span>
          <span className={styles["row-value"]}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
