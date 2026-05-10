import { IconFolder5Outline18, IconGlobe2Outline18 } from "@pond/icons/outline";
import { type ReactNode, useCallback, useMemo } from "react";
import {
  collectMetadataRows,
  collectPropertyRows,
  type PaneRow,
} from "@/components/save-preview/rows";
import { TagEditor } from "@/components/save-preview/tag-editor";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

export function PropertiesRail({ save }: { save: Save }) {
  const stats = useMemo(() => collectMetadataRows(save), [save]);
  const props = useMemo(() => collectPropertyRows(save), [save]);
  const hasLocalFile = save.files.length > 0;

  const openOriginal = useCallback(() => {
    if (!save.url) return;
    void window.pond.openExternal(save.url);
  }, [save.url]);

  const revealLocal = useCallback(() => {
    if (!hasLocalFile) return;
    void window.pond.revealSave(save.id);
  }, [save.id, hasLocalFile]);

  return (
    <aside className={styles.rail} aria-label="Properties">
      <Section label="Tags">
        <TagEditor save={save} />
      </Section>

      {props.length > 0 ? (
        <Section label="Properties">
          <Rows rows={props} />
        </Section>
      ) : null}

      {stats.length > 0 ? (
        <Section label="Metadata">
          <Rows rows={stats} />
        </Section>
      ) : null}

      <Section label="Actions">
        <RailButton
          icon={<IconGlobe2Outline18 width={12} height={12} />}
          label="Open Original"
          onClick={openOriginal}
          disabled={!save.url}
        />
        <RailButton
          icon={<IconFolder5Outline18 width={12} height={12} />}
          label="View Local Save"
          onClick={revealLocal}
          disabled={!hasLocalFile}
        />
      </Section>
    </aside>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className={styles["rail-section"]}>
      <h3 className={styles["rail-section-header"]}>{label}</h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: PaneRow[] }) {
  return (
    <div className={styles["rail-row-list"]}>
      {rows.map((row) => (
        <div key={row.id} className={styles["rail-row"]}>
          <span className={styles["rail-row-icon"]} aria-hidden>
            {row.icon}
          </span>
          <span className={styles["rail-row-label"]}>{row.label}</span>
          <span className={styles["rail-row-value"]}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function RailButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles["rail-button"]}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles["rail-button-icon"]} aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}
