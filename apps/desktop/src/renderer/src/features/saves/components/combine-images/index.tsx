import type {
  CombineImagesOptions,
  CombineImagesZoomAction,
} from "@shared/combine-images-contracts";
import {
  isCombinableImage,
  layoutCombinedImages,
} from "@shared/combine-images-layout";
import { useSelector } from "@tanstack/react-store";
import { type DragEvent, useEffect, useMemo, useState } from "react";
import { useRetainedSaves } from "@/features/saves/hooks/use-saves";
import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { savesStore } from "@/features/saves/state/pool";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { type Highlight, readStoredOptions, storeOptions } from "./options";
import { type CombineImage, Preview } from "./preview";
import { CombineSettings } from "./settings";
import { Strip } from "./strip";
import styles from "./styles.module.css";

function useImages(order: readonly string[]): CombineImage[] {
  const saves = useSelector(
    savesStore,
    (state) => order.map((id) => state.byId.get(id)),
    {
      compare: (a, b) =>
        a.length === b.length && a.every((save, index) => save === b[index]),
    },
  );
  useRetainedSaves(order);
  useEffect(() => {
    void ensureSaves(order);
  }, [order]);
  return useMemo(
    () =>
      saves.flatMap((save) => {
        const file = save?.files[0];
        return save && file && isCombinableImage(file.mimeType, file.path)
          ? [{ save, file }]
          : [];
      }),
    [saves],
  );
}

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

export function CombineImages({
  ids,
  folderId,
  onClose,
  onResolveDrop,
  subscribeZoom,
}: {
  ids: readonly string[];
  folderId: string | null;
  onClose: () => void;
  onResolveDrop: (files: readonly File[]) => Promise<string[]>;
  subscribeZoom: (
    callback: (action: CombineImagesZoomAction) => void,
  ) => () => void;
}) {
  const [options, setOptions] =
    useState<CombineImagesOptions>(readStoredOptions);
  const [order, setOrder] = useState(() => [...new Set(ids)]);
  const [highlight, setHighlight] = useState<Highlight>(null);
  const [dropping, setDropping] = useState(false);
  const [busy, setBusy] = useState(false);
  const images = useImages(order);
  const layout = useMemo(
    () =>
      layoutCombinedImages(
        images.map(({ save, file }) => ({
          width: file.width || save.width || 1,
          height: file.height || save.height || 1,
        })),
        options,
      ),
    [images, options],
  );
  useEffect(() => storeOptions(options), [options]);

  const reorder = (from: number, to: number) => {
    const shown = images.map(({ save }) => save.id);
    const [moved] = shown.splice(from, 1);
    if (!moved) return;
    shown.splice(to, 0, moved);
    setOrder(shown);
  };

  async function drop(files: readonly File[]) {
    const added = await onResolveDrop(files);
    if (added.length === 0) {
      notify({
        id: "combine-images-drop",
        title: "Couldn't add files",
        description: "Drag images from your library into this window.",
      });
      return;
    }
    setOrder((current) => [
      ...current,
      ...added.filter((id) => !current.includes(id)),
    ]);
  }

  async function combine() {
    const exporting = options.output === "export";
    setBusy(true);
    try {
      const result = await window.pond.query("saves.combineImages", {
        ids: images.map(({ save }) => save.id),
        folderId,
        options: { ...options, order: "selection" },
      });
      if (!result.ok) {
        if (result.reason !== "cancelled")
          notify({
            id: "combine-images",
            title: "Couldn't combine images",
            description: result.error ?? "Try again.",
          });
        return;
      }
      notify({
        id: "combine-images",
        title: exporting ? "Combined Image Exported" : "Combined Image Created",
        description:
          result.skipped && result.skipped > 0
            ? `${formatPlural(result.skipped, { one: "file was", other: "files were" })} skipped.`
            : undefined,
      });
      if (!exporting && options.deleteOriginals) setOrder([]);
    } catch (error) {
      notify({
        id: "combine-images",
        title: "Couldn't combine images",
        description: errorCopy(error, "Try again."),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className={styles.window}
      aria-label="Combine Images"
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        setDropping(false);
      }}
      onDrop={(event) => {
        setDropping(false);
        if (!carriesFiles(event)) return;
        event.preventDefault();
        void drop(Array.from(event.dataTransfer.files));
      }}
    >
      <CombineSettings
        options={options}
        layout={layout}
        count={images.length}
        busy={busy}
        onChange={setOptions}
        onHighlight={setHighlight}
        onSubmit={() => void combine()}
        onClose={onClose}
      />
      <Preview
        images={images}
        layout={layout}
        options={options}
        highlight={highlight}
        dropping={dropping}
        subscribeZoom={subscribeZoom}
      />
      {images.length > 0 ? (
        <Strip
          images={images}
          onReorder={reorder}
          onRemove={(id) =>
            setOrder((current) => current.filter((saveId) => saveId !== id))
          }
        />
      ) : (
        <div className={styles.placeholder} />
      )}
    </main>
  );
}
