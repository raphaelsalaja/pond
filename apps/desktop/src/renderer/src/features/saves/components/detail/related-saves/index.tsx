import { Button } from "@pond/ui";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { CardThumb } from "@/features/saves/components/card/media";
import { Card } from "@/features/saves/components/card/parts";
import {
  useRetainedSaves,
  useSavesById,
} from "@/features/saves/hooks/use-saves";
import { loadRelated, peekRelated } from "@/features/saves/lib/related";
import type { RelatedItem } from "@/features/saves/lib/related";
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
  const [attempt, setAttempt] = useState(0);
  const request = `${attempt}:${saveId}`;
  const [result, setResult] = useState<{
    request: string;
    items: Array<RelatedItem>;
  } | null>(null);
  const [failedRequest, setFailedRequest] = useState<string | null>(null);
  const [slowRequest, setSlowRequest] = useState<string | null>(null);
  const failed = failedRequest === request;
  const slow = slowRequest === request;
  const items =
    result?.request === request
      ? result.items
      : attempt === 0
        ? peekRelated(saveId)
        : null;
  const itemIds = items?.map((item) => item.id) ?? [];
  useRetainedSaves(itemIds);
  const saves = useSavesById(itemIds);

  useEffect(() => {
    let active = true;
    const current = `${attempt}:${saveId}`;
    if (attempt === 0 && peekRelated(saveId)) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (active) {
        setSlowRequest(current);
      }
    }, LOADING_DELAY_MS);
    void loadRelated(saveId, attempt > 0)
      .then((loaded) => {
        if (active) {
          setResult({ request: current, items: loaded });
        }
      })
      .catch(() => {
        if (active) {
          setFailedRequest(current);
        }
      });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [attempt, saveId]);

  if (failed) {
    return (
      <div className={styles.message} role="alert">
        <span>Couldn&apos;t load related Saves.</span>
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
  if (items === null) {
    return slow ? (
      <p className={styles.message} role="status">
        Finding related Saves
      </p>
    ) : null;
  }
  if (items.length === 0) {
    return <p className={styles.message}>No related Saves found.</p>;
  }

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
