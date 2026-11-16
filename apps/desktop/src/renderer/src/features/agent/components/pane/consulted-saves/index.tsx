import { Button, Popover, Reveal } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import { sourceExcerpt } from "@shared/assistant-text";
import type { ReactNode, RefObject } from "react";
import { useState } from "react";
import { pickPrimaryFile } from "@/features/saves/media";
import { openSave } from "@/features/saves/navigation";
import { useSave } from "@/features/saves/pool";
import { formatAbsolute } from "@/shared/lib/format";
import { SourceThumbnail, useSourceCovers } from "../save-preview";
import styles from "./styles.module.css";

interface ReferenceItem {
  id: string;
  title: string;
  description?: string;
  media?: ReactNode;
}

function toReferenceItems(
  ids: string[],
  sources: AssistantSource[],
  renderMedia?: (source: AssistantSource) => ReactNode,
): ReferenceItem[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return [...new Set(ids)].flatMap((id) => {
    const source = byId.get(id);
    if (!source) return [];
    const excerpt = sourceExcerpt(source.notes || source.description, 140);
    return [
      {
        id: source.id,
        title: source.title || "Untitled",
        description: excerpt || undefined,
        media: renderMedia?.(source) ?? (
          <SourceThumbnail id={source.id} source={source} size="compact" />
        ),
      },
    ];
  });
}

function fileType(path: string | undefined) {
  const dot = path?.lastIndexOf(".") ?? -1;
  return path && dot >= 0 ? path.slice(dot + 1).toUpperCase() : null;
}

function RowMeta({ id }: { id: string }) {
  const save = useSave(id);
  if (!save) return null;
  const type = fileType(pickPrimaryFile(save)?.path);
  const date = formatAbsolute(save.savedAt);
  return (
    <span className={styles.meta}>
      {type ? <span className={styles.type}>{type}</span> : null}
      {date ? <span>{date}</span> : null}
    </span>
  );
}

export function ConsultedSaves({
  sources,
  saveIds,
  attachedIds = [],
  onOpenSave,
  onAttach,
  renderMedia,
}: {
  sources: AssistantSource[];
  saveIds?: string[];
  attachedIds?: string[];
  onOpenSave: (id: string) => void;
  onAttach: (sources: AssistantSource[]) => void;
  renderMedia?: (source: AssistantSource) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = toReferenceItems(
    saveIds ?? sources.map((source) => source.id),
    sources,
    renderMedia,
  );
  useSourceCovers(items.map((item) => item.id));
  if (!items.length) return null;
  const renderRow = (item: ReferenceItem) => (
    <article key={item.id} className={styles.row}>
      <Popover.Root>
        <Popover.Trigger
          render={
            <Button variant="bare" width="full" className={styles.open} />
          }
          aria-label={`Preview ${item.title}`}
        >
          <span className={styles.media}>{item.media}</span>
          <span className={styles.title} title={item.title}>
            {item.title}
          </span>
          <RowMeta id={item.id} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="top" align="start" sideOffset={8}>
            <Popover.Popup className={styles.preview}>
              <Popover.Title className={styles.heading}>
                {item.title}
              </Popover.Title>
              <Popover.Description className={styles.description}>
                {item.description || "Only the saved title is available."}
              </Popover.Description>
              <div className={styles.actions}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onOpenSave(item.id)}
                >
                  Open Save
                </Button>
                <Button
                  size="sm"
                  variant="text"
                  aria-label={`Add ${item.title}`}
                  disabled={attachedIds.includes(item.id)}
                  onClick={() => {
                    const source = sources.find((save) => save.id === item.id);
                    if (source) onAttach([source]);
                  }}
                >
                  {attachedIds.includes(item.id)
                    ? "Added to message"
                    : "Add to message"}
                </Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </article>
  );
  return (
    <section className={styles.card} aria-label="Consulted Saves">
      <div className={styles.rows} data-scroll-fade="vertical">
        {items.slice(0, 3).map(renderRow)}
        <Reveal visible={expanded}>
          <div className={styles.more}>{items.slice(3).map(renderRow)}</div>
        </Reveal>
      </div>
      {items.length > 3 ? (
        <div className={styles.footer}>
          <Button
            size="xs"
            variant="text"
            width="full"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show Less" : `Show ${items.length - 3} More`}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function ReferencedSavesPopover({
  open,
  sources,
  attachedIds,
  anchorRef,
  onAttach,
  onClose,
}: {
  open: boolean;
  sources: AssistantSource[];
  attachedIds: string[];
  anchorRef: RefObject<HTMLElement | null>;
  onAttach: (sources: AssistantSource[]) => void;
  onClose: () => void;
}) {
  return (
    <Popover.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchorRef}
          side="top"
          align="start"
          sideOffset={8}
        >
          <Popover.Popup className={styles.popup} aria-label="Referenced Saves">
            <ConsultedSaves
              sources={sources}
              attachedIds={attachedIds}
              onOpenSave={openSave}
              onAttach={(next) => {
                onAttach(next);
                onClose();
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
