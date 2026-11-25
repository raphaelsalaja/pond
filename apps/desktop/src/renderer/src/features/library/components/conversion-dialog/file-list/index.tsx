import { IconFileExport, IconXmark } from "@pond/icons";
import { Button, Empty, EmptyPreview, HoverHighlight } from "@pond/ui";
import type { ConversionPreset } from "@shared/conversion-contracts";
import { typeLabelForPath } from "@shared/file-format";
import { CardThumb } from "@/features/saves";
import type { Save, SaveFile } from "@/features/saves/types";
import { fitInside } from "../export-plan";
import type { Dimensions } from "../export-plan";
import styles from "./styles.module.css";

export interface ExportRow {
  id: string;
  save: Save | undefined;
  file: SaveFile | null;
  skipped: boolean;
}

export interface ExportTarget {
  label: string;
  box: Pick<ConversionPreset, "width" | "height">;
}

function dimensions(size: Dimensions): string {
  return `${size.width} × ${size.height}`;
}

function Row({
  row,
  target,
  disabled,
  onRemove,
}: {
  row: ExportRow;
  target: ExportTarget | null;
  disabled: boolean;
  onRemove: () => void;
}) {
  const title = row.save?.title || "Untitled";
  const from = row.file ? typeLabelForPath(row.file.path) : null;
  const before =
    row.file?.width && row.file.height
      ? { width: row.file.width, height: row.file.height }
      : null;
  const fitted =
    before && target
      ? fitInside(before.width, before.height, target.box)
      : null;
  const after =
    fitted &&
    (fitted.width !== before?.width || fitted.height !== before?.height)
      ? fitted
      : null;
  const status = !row.save
    ? null
    : !row.file
      ? "No file to export"
      : row.skipped && target
        ? `Can't convert to ${target.label}`
        : null;
  return (
    <li
      className={styles.row}
      data-hover-row=""
      data-skipped={row.skipped || undefined}
    >
      <span className={styles.frame}>
        {row.save ? <CardThumb save={row.save} width={96} /> : null}
      </span>
      <span className={styles.caption}>
        <span className={styles.title} title={title}>
          {title}
        </span>
        {status ? <span className={styles.status}>{status}</span> : null}
      </span>
      <span className={styles.format}>
        {from}
        {target && !row.skipped && target.label !== from
          ? ` → ${target.label}`
          : null}
      </span>
      <span className={styles.size}>
        {before ? dimensions(before) : null}
        {after && !row.skipped ? ` → ${dimensions(after)}` : null}
      </span>
      <Button
        className={styles.remove}
        icon
        size="xs"
        variant="ghost"
        aria-label={`Remove ${title}`}
        disabled={disabled}
        onClick={onRemove}
      >
        <IconXmark size={12} />
      </Button>
    </li>
  );
}

export function FileList({
  rows,
  target,
  disabled,
  onRemove,
}: {
  rows: ReadonlyArray<ExportRow>;
  target: ExportTarget | null;
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        <Empty.Root size="card">
          <Empty.Media>
            <EmptyPreview.Root>
              <EmptyPreview.Row>
                <EmptyPreview.Icon>
                  <IconFileExport size={12} />
                </EmptyPreview.Icon>
                <EmptyPreview.Line width={46} />
                <EmptyPreview.Space />
                <EmptyPreview.Line width={24} tone="mid" />
              </EmptyPreview.Row>
            </EmptyPreview.Root>
          </Empty.Media>
          <Empty.Title>No Saves to Export</Empty.Title>
        </Empty.Root>
      </div>
    );
  }
  return (
    <ul
      className={styles.list}
      aria-label="Saves to export"
      data-scroll-fade="vertical"
    >
      {rows.map((row) => (
        <Row
          key={row.id}
          row={row}
          target={target}
          disabled={disabled}
          onRemove={() => onRemove(row.id)}
        />
      ))}
      <HoverHighlight render={<li />} />
    </ul>
  );
}
