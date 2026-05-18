import { memo, useMemo } from "react";
import {
  Card,
  type CardLayout,
  type CardSelection,
} from "@/components/card-thumb";
import { Library } from "@/components/library";
import { SaveContextMenu } from "@/components/save-context-menu";
import { SourceBadge } from "@/components/source-badge";
import { useDisplayPrefs } from "@/lib/display-prefs";
import { buildMediaUnits, pickPrimaryFile } from "@/pool/media";
import { selection, useIsSelected } from "@/pool/selection";
import type { Save } from "@/pool/types";

interface SaveCardProps {
  save: Save;
  selectedId: string | null;
  multiSelectActive: boolean;
  layout: CardLayout;
  onClick: (id: string, e: React.MouseEvent) => void;
  onDoubleClick: (id: string) => void;
  packedWidth?: number;
  packedHeight?: number;
  packedTop?: number;
  packedLeft?: number;
}

export const SaveCard = memo(function SaveCard({
  save,
  selectedId,
  multiSelectActive,
  layout,
  onClick,
  onDoubleClick,
  packedWidth,
  packedHeight,
  packedTop,
  packedLeft,
}: SaveCardProps) {
  const isMulti = useIsSelected(save.id);
  const isPrimary = selectedId === save.id;
  const cardSelection: CardSelection | undefined = isPrimary
    ? "primary"
    : isMulti
      ? "multi"
      : undefined;

  const liStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (packedWidth == null || packedHeight == null) return undefined;
    const base: React.CSSProperties = {
      width: `${packedWidth}px`,
      ["--packed-h" as never]: `${packedHeight}px`,
    };
    if (packedTop != null && packedLeft != null) {
      base.position = "absolute";
      base.top = `${packedTop}px`;
      base.left = `${packedLeft}px`;
    }
    return base;
  }, [packedWidth, packedHeight, packedTop, packedLeft]);

  return (
    <SaveContextMenu save={save}>
      <Library.Item
        selected={isPrimary}
        multi={isMulti}
        dimmed={multiSelectActive && !isMulti}
        style={liStyle}
        draggable={save.files.length > 0}
        onDragStart={(e) => {
          if (save.files.length === 0) return;
          e.preventDefault();
          void window.pond.query("saves.startDrag", {
            id: save.id,
            fileIndex: save.coverIndex ?? 0,
          });
        }}
      >
        <Library.Item.Checkbox
          checked={isMulti}
          aria-label={isMulti ? "Deselect" : "Select"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            selection.toggle(save.id);
            if (selection.has(save.id)) selection.setAnchor(save.id);
          }}
        />
        <Library.Item.Select
          aria-pressed={isPrimary}
          onClick={(e) => onClick(save.id, e)}
          onDoubleClick={() => onDoubleClick(save.id)}
        >
          <SaveCardBody save={save} layout={layout} selection={cardSelection} />
        </Library.Item.Select>
      </Library.Item>
    </SaveContextMenu>
  );
});

const SaveCardBody = memo(function SaveCardBody({
  save,
  layout,
  selection,
}: {
  save: Save;
  layout?: CardLayout;
  selection?: CardSelection;
}) {
  const primary = pickPrimaryFile(save);
  const w = primary?.width ?? save.width ?? null;
  const h = primary?.height ?? save.height ?? null;
  // Clamp to a sane range so panoramas / extreme portraits don't stretch
  // a justified row into a single tile or shrink a waterfall card.
  const ratio = w && h ? Math.min(2.5, Math.max(0.4, w / h)) : 1;
  const mediaStyle = useMemo<React.CSSProperties>(
    () =>
      ({
        "--card-aspect": w && h ? `${w} / ${h}` : "1 / 1",
        "--card-aspect-num": String(ratio),
      }) as React.CSSProperties,
    [w, h, ratio],
  );
  const prefs = useDisplayPrefs();
  const showMeta = prefs.name || prefs.date;
  // Carousel count = displayable media units only. Avatars are author
  // metadata, and posters are paired with their video, so neither should
  // pad the badge.
  const mediaUnitCount = useMemo(() => buildMediaUnits(save).length, [save]);
  return (
    <>
      <Library.Item.Media style={mediaStyle}>
        <Card.Root save={save} layout={layout} selection={selection}>
          <Card.Media />
          <Card.DownloadingBadge />
        </Card.Root>
        {prefs.fileCount && mediaUnitCount > 1 ? (
          <Library.Item.Count aria-label={`${mediaUnitCount} media files`}>
            {mediaUnitCount}
          </Library.Item.Count>
        ) : null}
        {prefs.sourceBadge ? (
          <Library.Item.SourceBadge>
            <SourceBadge.Root source={save.source} data-size="sm" />
          </Library.Item.SourceBadge>
        ) : null}
      </Library.Item.Media>
      {showMeta ? (
        <Library.Item.Meta>
          {prefs.name ? (
            <Library.Item.Title>{save.title ?? save.url}</Library.Item.Title>
          ) : null}
          {prefs.date ? (
            <Library.Item.Time>
              {formatAbsolute(save.savedAt)}
            </Library.Item.Time>
          ) : null}
        </Library.Item.Meta>
      ) : null}
    </>
  );
});

export function formatAbsolute(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function formatBytes(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function extensionFor(save: Save): string {
  const cover = save.files[save.coverIndex ?? 0];
  if (cover?.path) {
    const m = /\.([a-z0-9]+)$/i.exec(cover.path);
    if (m?.[1]) return m[1].toLowerCase();
  }
  if (cover?.mimeType) {
    const m = /^[^/]+\/(.+)$/.exec(cover.mimeType);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return "";
}
