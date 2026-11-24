import { Button } from "@pond/ui";
import { type CSSProperties, useEffect, useState } from "react";
import { CardThumb } from "@/features/saves/components/card/media";
import { Card } from "@/features/saves/components/card/parts";
import { useRetainedSaves, useSaves } from "@/features/saves/hooks/use-saves";
import {
  loadRelated,
  peekRelated,
  type RelatedItem,
} from "@/features/saves/lib/related";
import { openSave } from "@/features/saves/lib/save-nav";
import { displayTitleForSave } from "@/features/saves/lib/text";
import { layoutAspectFor } from "@/features/saves/state/aspect";
import type { Save } from "@/features/saves/types";
import styles from "./styles.module.css";

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

/** Under this, the results replace an empty panel instead of a loading line flashing first. */
const LOADING_DELAY_MS = 400;

export function RelatedSaves({ saveId }: { saveId: string }) {
  const saves = useSaves();
  const [result, setResult] = useState(() => ({
    saveId,
    items: peekRelated(saveId),
  }));
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const items = result.saveId === saveId ? result.items : peekRelated(saveId);
  useRetainedSaves(items?.map((item) => item.id) ?? []);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setSlow(false);
    const cached = attempt === 0 ? peekRelated(saveId) : null;
    if (cached) {
      setResult({ saveId, items: cached });
      return;
    }
    setResult({ saveId, items: null });
    const timer = window.setTimeout(() => {
      if (active) setSlow(true);
    }, LOADING_DELAY_MS);
    void loadRelated(saveId, attempt > 0)
      .then((loaded) => {
        if (active) setResult({ saveId, items: loaded });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      window.clearTimeout(timer);
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
    return slow ? (
      <p className={styles.message} role="status">
        Finding related Saves
      </p>
    ) : null;
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
