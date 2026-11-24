import { Button, Popover } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import { pickPrimaryFile } from "@/features/saves/media";
import { useSave } from "@/features/saves/pool";
import { getSourceDefForIdentity } from "@/features/sources";
import { formatAbsolute } from "@/shared/lib/format";
import { fileType, SavePreview, toReferenceItems } from "../consulted-saves";
import type { ReferenceItem } from "../consulted-saves";
import { SourceThumbnail, useSourceCovers } from "../save-preview";
import styles from "./styles.module.css";

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function Origin({ source }: { source: AssistantSource }) {
  const def = getSourceDefForIdentity(source.source);
  const Icon = def?.icon;
  const label =
    def && def.source !== "web"
      ? def.label
      : (hostOf(source.url) ?? def?.label);
  if (!label) {
    return null;
  }
  return (
    <span className={styles.origin}>
      {Icon ? <Icon width={14} height={14} /> : null}
      <span className={styles.label}>{label}</span>
    </span>
  );
}

function Meta({ item }: { item: ReferenceItem }) {
  const save = useSave(item.id);
  const lead = save
    ? (fileType(pickPrimaryFile(save)?.path) ?? formatAbsolute(save.savedAt))
    : null;
  const text = [lead, item.description].filter(Boolean).join(" · ");
  return text ? <span className={styles.meta}>{text}</span> : null;
}

export function SaveCards({
  sources,
  saveIds,
  attachedIds = [],
  onOpenSave,
  onAttach,
}: {
  sources: Array<AssistantSource>;
  saveIds?: Array<string>;
  attachedIds?: Array<string>;
  onOpenSave: (id: string) => void;
  onAttach: (sources: Array<AssistantSource>) => void;
}) {
  const items = toReferenceItems(
    saveIds ?? sources.map((source) => source.id),
    sources,
    (source) => <SourceThumbnail id={source.id} source={source} visual />,
  );
  useSourceCovers(items.map((item) => item.id));
  if (!items.length) {
    return null;
  }
  const byId = new Map(sources.map((source) => [source.id, source]));
  return (
    <section
      className={styles.cards}
      aria-label="Consulted Saves"
      data-scroll-fade="horizontal"
    >
      {items.map((item) => {
        const source = byId.get(item.id);
        return (
          <Popover.Root key={item.id}>
            <Popover.Trigger
              render={<Button variant="bare" className={styles.card} />}
              aria-label={`Preview ${item.title}`}
            >
              <span className={styles.media}>{item.media}</span>
              <span className={styles.text}>
                <span className={styles.title} title={item.title}>
                  {item.title}
                </span>
                <Meta item={item} />
              </span>
              {source ? <Origin source={source} /> : null}
            </Popover.Trigger>
            <SavePreview
              item={item}
              sources={sources}
              attachedIds={attachedIds}
              onOpenSave={onOpenSave}
              onAttach={onAttach}
            />
          </Popover.Root>
        );
      })}
    </section>
  );
}
