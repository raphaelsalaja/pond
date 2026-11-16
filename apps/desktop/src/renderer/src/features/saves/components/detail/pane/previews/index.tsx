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
  deriveTypeLabel,
  detailsPreviewUrl,
  pickCardUnit,
  pickPrimaryFile,
} from "@/features/saves/lib/media/units";
import { aspectFor } from "@/features/saves/state/aspect";
import type { Save } from "@/features/saves/types";
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

interface PreviewStyle extends CSSProperties {
  "--preview-aspect": number;
}

function Preview({ save, url }: { save: Save; url: string | null }) {
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
      measured && measured.url === url ? measured.aspect : aspectFor(save),
  };
  return (
    <figure className={styles.preview}>
      {url && failed !== url ? (
        <img
          ref={image}
          src={url}
          alt={save.title || "Save preview"}
          draggable={false}
          style={style}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) {
              setMeasured({ url, aspect: naturalWidth / naturalHeight });
            }
          }}
          onError={() => setFailed(url)}
        />
      ) : (
        <span className={styles.placeholder}>{save.title || "No preview"}</span>
      )}
      <figcaption>{inspectorFormat(save)}</figcaption>
    </figure>
  );
}

interface Entry {
  save: Save;
  url: string | null;
}

function Layer({
  entry,
  role,
  onReady,
}: {
  entry: StageEntry<Entry>;
  role: StageRole;
  onReady: (key: string) => void;
}) {
  const { key, value } = entry;
  const report = useCallback(() => onReady(key), [key, onReady]);
  const held = role === "held";
  return (
    <div
      className={styles.layer}
      data-pending={role === "pending" || undefined}
      aria-hidden={held || undefined}
      inert={held}
    >
      <MediaReadyContext value={report}>
        <Preview save={value.save} url={value.url} />
      </MediaReadyContext>
    </div>
  );
}

export function SavePreviews({ saves }: { saves: readonly Save[] }) {
  const single = saves.length === 1 ? saves[0] : undefined;
  const url = single ? detailsPreviewUrl(pickCardUnit(single)) : null;
  const target = useMemo<StageEntry<Entry> | null>(
    () =>
      single
        ? {
            key: `${single.id}:${url}`,
            holds: url !== null,
            value: { save: single, url },
          }
        : null,
    [single, url],
  );
  const stage = useHeldStage(target);

  if (single) {
    return (
      <div className={styles.list}>
        {stage.layers.map(({ entry, role }) => (
          <Layer
            key={entry.key}
            entry={entry}
            role={role}
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
