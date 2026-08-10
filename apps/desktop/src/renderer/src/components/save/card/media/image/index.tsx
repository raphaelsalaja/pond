import { useCallback } from "react";
import { CARD_THUMB_WIDTH } from "@/components/save/card/media/lib/constants";
import { useImageReady } from "@/components/save/card/media/lib/use-image-ready";
import type { MediaUnit } from "@/lib/media/units";
import { withThumbWidth } from "@/lib/media/url";
import type { Save } from "@/lib/types";
import { recordAspect } from "@/stores/aspect";
import styles from "./styles.module.css";

export function CardImage({
  save,
  unit,
  onBroken,
  onReady,
}: {
  save: Save;
  unit: MediaUnit;
  onBroken: () => void;
  onReady: () => void;
}) {
  const file = save.files.find((f) => f.path === unit.key);
  const w = file?.width ?? save.width ?? undefined;
  const h = file?.height ?? save.height ?? undefined;
  const src = withThumbWidth(unit.url, CARD_THUMB_WIDTH);
  const reportReady = useCallback(
    (image: HTMLImageElement) => {
      recordAspect(save.id, image.naturalWidth, image.naturalHeight);
      onReady();
    },
    [onReady, save.id],
  );
  const ready = useImageReady(src, reportReady);

  return (
    <img
      ref={ready.ref}
      src={src}
      alt=""
      decoding="async"
      /** Packed-grid windowing is already the lazy boundary; request mounted runway cards immediately. */
      fetchPriority="auto"
      width={w}
      height={h}
      className={styles.media}
      data-loaded={ready.loaded ? "true" : "false"}
      onLoad={ready.onLoad}
      onError={onBroken}
    />
  );
}
