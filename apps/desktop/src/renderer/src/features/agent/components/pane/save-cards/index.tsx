import { IconFile } from "@pond/icons";
import { Popover } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import { SaveTile } from "@/features/saves";
import { SavePreview, toReferenceItems } from "../consulted-saves";
import { SourceThumbnail, useSourceCovers } from "../save-preview";
import styles from "./styles.module.css";

/** How wide each card is, so a reply's row of Saves reads like a strip of the Library grid. */
const CARD_WIDTH = 156;

/** The Saves a reply consulted, drawn with the Library's own cards; each opens a preview to open or attach it. */
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
  if (!items.length) return null;
  return (
    <section
      className={styles.cards}
      aria-label="Consulted Saves"
      data-scroll-fade="horizontal"
    >
      {items.map((item) => (
        <Popover.Root key={item.id}>
          <Popover.Trigger
            render={(props) => (
              <SaveTile
                {...props}
                saveId={item.id}
                width={CARD_WIDTH}
                badges={false}
                fallback={{ icon: <IconFile />, title: item.title }}
              />
            )}
            aria-label={`Preview ${item.title}`}
          />
          <SavePreview
            item={item}
            sources={sources}
            attachedIds={attachedIds}
            onOpenSave={onOpenSave}
            onAttach={onAttach}
          />
        </Popover.Root>
      ))}
    </section>
  );
}
