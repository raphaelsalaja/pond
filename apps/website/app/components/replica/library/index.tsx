import { IconBarsFilter, IconSliders } from "@pond/icons";
import { Button, Input } from "@pond/ui";
import type { LibrarySave } from "@/lib/library";
import { Card } from "../card";
import { packWaterfall } from "../layout";
import styles from "./styles.module.css";

/** Cards above the fold in the hero load eagerly; the rest wait for the scroll. */
const EAGER_COUNT = 18;

interface LibraryProps {
  saves: readonly LibrarySave[];
  selected?: string | null;
  detailsOpen: boolean;
  query?: string;
}

export function SearchChrome({
  query,
  placeholder = "Search your library…",
  actions,
}: {
  query?: string;
  placeholder?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={styles.chrome}>
      <div className={styles.search}>
        <Input.Root className={styles.input} size="md" variant="borderless">
          <Input.Field
            className={styles.field}
            placeholder={placeholder}
            defaultValue={query}
            readOnly
            tabIndex={-1}
          />
        </Input.Root>
      </div>
      <div className={styles.actions}>
        {actions}
        <Button icon size="sm" variant="ghost" aria-label="View Options">
          <IconSliders />
        </Button>
        <Button icon size="sm" variant="ghost" aria-label="Filter">
          <IconBarsFilter />
        </Button>
      </div>
    </div>
  );
}

export function Library({ saves, selected, detailsOpen, query }: LibraryProps) {
  const layout = packWaterfall(saves, detailsOpen);
  return (
    <div className={styles.body}>
      <SearchChrome query={query} />
      <div className={styles.main}>
        <div className={styles.grid}>
          {saves.map((save, index) => {
            const item = layout[index];
            if (!item) return null;
            return (
              <Card
                key={save.id}
                save={save}
                layout={item}
                selected={save.id === selected}
                eager={index < EAGER_COUNT}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
