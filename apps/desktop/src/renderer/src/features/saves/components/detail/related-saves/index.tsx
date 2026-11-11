import { Button } from "@pond/ui";
import type { QueryResult } from "@shared/query-contracts";
import { type CSSProperties, useEffect, useState } from "react";
import { CardThumb } from "@/features/saves/components/card/media";
import { Card } from "@/features/saves/components/card/parts";
import { useRetainedSaves, useSaves } from "@/features/saves/hooks/use-saves";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { openSave } from "@/features/saves/lib/save-nav";
import { displayTitleForSave } from "@/features/saves/lib/text";
import { layoutAspectFor } from "@/features/saves/state/aspect";
import type { Save } from "@/features/saves/types";
import styles from "./styles.module.css";

type RelatedItem = QueryResult<"saves.related">["items"][number];

function reasonLabel(reason: RelatedItem["reason"]): string {
  return reason === "already-organized" ? "Same folder" : "Related content";
}

interface FrameStyle extends CSSProperties {
  "--frame-aspect": string;
  "--frame-width": string;
}

function RelatedCard({ item, save }: { item: RelatedItem; save: Save }) {
  const title = displayTitleForSave(save);
  const aspect = layoutAspectFor(save);
  const frameStyle: FrameStyle = {
    "--frame-aspect": String(aspect),
    "--frame-width": `${Math.min(1, aspect) * 100}%`,
  };
  return (
    <Card.Root className={styles.item}>
      <Card.Select
        aria-label={`Open ${title}`}
        onClick={() => openSave(save.id)}
      >
        <Card.Media className={styles.media}>
          <Card.Frame className={styles.frame} style={frameStyle}>
            <CardThumb save={save} view="grid" width={112} />
          </Card.Frame>
        </Card.Media>
        <Card.Meta title={title} time={reasonLabel(item.reason)} />
      </Card.Select>
    </Card.Root>
  );
}

export function RelatedSaves({ saveId }: { saveId: string }) {
  const saves = useSaves();
  const [items, setItems] = useState<RelatedItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useRetainedSaves(items?.map((item) => item.id) ?? []);

  useEffect(() => {
    void attempt;
    let active = true;
    setItems(null);
    setFailed(false);
    void window.pond
      .query("saves.related", { id: saveId, limit: 12 })
      .then(async (result) => {
        await ensureSaves(result.items.map((item) => item.id));
        if (active) setItems(result.items);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt, saveId]);

  if (failed) {
    return (
      <div className={styles.message} role="alert">
        <span>Couldn't load related Saves.</span>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Try Again
        </Button>
      </div>
    );
  }
  if (items === null)
    return (
      <p className={styles.message} role="status">
        Finding related Saves
      </p>
    );
  if (items.length === 0)
    return <p className={styles.message}>No related Saves found.</p>;

  const byId = new Map(saves.map((save) => [save.id, save]));
  return (
    <ul className={styles.list} aria-label="Related Saves">
      {items.flatMap((item) => {
        const save = byId.get(item.id);
        return save
          ? [<RelatedCard key={item.id} item={item} save={save} />]
          : [];
      })}
    </ul>
  );
}
