import { IconEyeSlash } from "@pond/icons";
import { Button } from "@pond/ui";
import { typeLabelForPath } from "@shared/file-format";
import {
  type CSSProperties,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type StageEntry,
  type StageRole,
  useHeldStage,
} from "@/features/saves/hooks/use-held-stage";
import { useImageDecoded } from "@/features/saves/hooks/use-image-decoded";
import {
  MediaReadyContext,
  useReportMediaReady,
} from "@/features/saves/hooks/use-media-ready";
import {
  buildOriginalMediaUnits,
  cardThumbnailUrl,
  deriveTypeLabel,
  detailsPreviewUrl,
  pickCardUnit,
  pickPrimaryFile,
} from "@/features/saves/lib/media/units";
import { shouldBlurSensitiveThumbnail } from "@/features/saves/lib/sensitive-content";
import {
  aspectDimsFor,
  aspectFor,
  clampRatio,
} from "@/features/saves/state/aspect";
import { openThumbnailViewer } from "@/features/saves/state/thumbnail-viewer";
import type { Save } from "@/features/saves/types";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

function inspectorFormat(save: Save): string {
  const file = pickPrimaryFile(save);
  return (
    (file ? typeLabelForPath(file.path) : null) ??
    deriveTypeLabel(file, save) ??
    "File"
  );
}

function entries(saves: readonly Save[]) {
  const next = saves.map((save) => ({
    save,
    url: detailsPreviewUrl(pickCardUnit(save)),
  }));
  const withImages = next.filter((entry) => entry.url !== null);
  return (withImages.length > 0 ? withImages : next).slice(0, 4);
}

export interface Card {
  key: string;
  url: string;
  aspect: number;
}

/** Cards kept mounted after the top card, so the next ones slide in instead of popping. */
const STACK_DEPTH = 3;

export function stackCards(save: Save): Card[] {
  return buildOriginalMediaUnits(save).flatMap((unit) => {
    const url = detailsPreviewUrl(unit);
    if (!url) return [];
    const { w, h } = aspectDimsFor(save, {}, unit);
    return [{ key: unit.key, url, aspect: w && h ? clampRatio(w, h) : 1 }];
  });
}

interface PreviewStyle extends CSSProperties {
  "--preview-aspect": number;
}

function Preview({
  save,
  url,
  aspect,
  slot,
  caption = true,
  viewable = false,
}: {
  save: Save;
  url: string | null;
  aspect?: number;
  slot?: number;
  caption?: boolean;
  viewable?: boolean;
}) {
  const [ai] = usePrefs("ai");
  const sensitive = shouldBlurSensitiveThumbnail(
    ai.enableSensitiveContent && ai.blurSensitiveThumbnails,
    save.sensitiveScore,
  );
  const [failed, setFailed] = useState<string | null>(null);
  const [measured, setMeasured] = useState<{
    url: string;
    aspect: number;
  } | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const decoded = useImageDecoded(image, url ?? "");
  useReportMediaReady(decoded || !url || failed === url);
  const style: PreviewStyle = {
    "--preview-aspect":
      measured && measured.url === url
        ? measured.aspect
        : (aspect ?? aspectFor(save)),
  };
  const img =
    url && failed !== url ? (
      <img
        ref={image}
        src={url}
        alt={save.title || "Save preview"}
        draggable={false}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;
          if (naturalWidth > 0 && naturalHeight > 0) {
            setMeasured({ url, aspect: naturalWidth / naturalHeight });
          }
        }}
        onError={() => setFailed(url)}
      />
    ) : null;
  return (
    <figure
      className={styles.preview}
      data-slot={slot}
      data-sensitive={sensitive || undefined}
      style={style}
    >
      {!img ? (
        <span className={styles.placeholder}>{save.title || "No preview"}</span>
      ) : viewable && cardThumbnailUrl(save) !== null ? (
        <Button
          variant="bare"
          rounding="rounded"
          className={styles.open}
          aria-label="View Thumbnail"
          onClick={() => openThumbnailViewer(save.id)}
        >
          {img}
        </Button>
      ) : (
        img
      )}
      {sensitive && url && failed !== url ? (
        <span className={styles.sensitive} aria-hidden>
          <IconEyeSlash size={12} />
        </span>
      ) : null}
      {caption ? <figcaption>{inspectorFormat(save)}</figcaption> : null}
    </figure>
  );
}

interface Entry {
  save: Save;
  url: string | null;
  stack: Card[];
}

function Layer({
  entry,
  role,
  activePath,
  onReady,
}: {
  entry: StageEntry<Entry>;
  role: StageRole;
  activePath: string | null;
  onReady: (key: string) => void;
}) {
  const { key, value } = entry;
  const report = useCallback(() => onReady(key), [key, onReady]);
  const held = role === "held";
  const stacked = value.stack.length > 1;
  const found = value.stack.findIndex((card) => card.key === activePath);
  /** The file index is shared across Saves, so a held layer keeps its last card instead of reading the next Save's. */
  const [last, setLast] = useState(Math.max(0, found));
  if (found >= 0 && found !== last) setLast(found);
  const top = found >= 0 ? found : last;
  return (
    <div
      className={styles.layer}
      data-pending={role === "pending" || undefined}
      data-multiple={stacked || undefined}
      aria-hidden={held || undefined}
      inert={held}
    >
      <MediaReadyContext value={report}>
        {stacked ? (
          value.stack.map((card, index) => {
            const slot = index - top;
            if (slot < -1 || slot > STACK_DEPTH + 1) return null;
            return (
              <Preview
                key={card.key}
                save={value.save}
                url={card.url}
                aspect={card.aspect}
                slot={slot}
                caption={slot === 0}
              />
            );
          })
        ) : (
          <Preview save={value.save} url={value.url} viewable />
        )}
      </MediaReadyContext>
    </div>
  );
}

export function SavePreviews({
  saves,
  fileIndex = null,
  activeKey = null,
}: {
  saves: readonly Save[];
  fileIndex?: number | null;
  /** A stack card to show on top when the viewer isn't driving `fileIndex`. */
  activeKey?: string | null;
}) {
  const single = saves.length === 1 ? saves[0] : undefined;
  const url = single ? detailsPreviewUrl(pickCardUnit(single)) : null;
  const activePath =
    activeKey ??
    (fileIndex === null ? null : (single?.files[fileIndex]?.path ?? null));
  const target = useMemo<StageEntry<Entry> | null>(() => {
    if (!single) return null;
    const stack = stackCards(single);
    return {
      key: `${single.id}:${url}:${stack.map((card) => card.url).join("\0")}`,
      holds: url !== null,
      value: { save: single, url, stack },
    };
  }, [single, url]);
  const stage = useHeldStage(target);

  if (single) {
    return (
      <div className={styles.list}>
        {stage.layers.map(({ entry, role }) => (
          <Layer
            key={entry.key}
            entry={entry}
            role={role}
            activePath={activePath}
            onReady={stage.ready}
          />
        ))}
      </div>
    );
  }

  const previews = entries(saves);
  if (previews.length === 0) return null;
  return (
    <div className={styles.list} data-multiple={saves.length > 1 || undefined}>
      {previews.map(({ save, url }) => (
        <Preview key={save.id} save={save} url={url} />
      ))}
    </div>
  );
}
