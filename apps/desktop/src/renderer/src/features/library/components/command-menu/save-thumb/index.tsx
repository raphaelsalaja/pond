import { IconFile, IconImage, IconLink2 } from "@pond/icons";
import { type CSSProperties, useMemo, useState } from "react";
import {
  aspectFor,
  clampRatio,
  pickCardUnit,
  shouldBlurSensitiveThumbnail,
  thumbUrlFor,
} from "@/features/saves/media";
import type { Save } from "@/features/saves/types";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

const THUMB_SIZE = 32;

interface ThumbStyle extends CSSProperties {
  "--thumb-width": number;
  "--thumb-height": number;
}

function SaveIcon({ save }: { save: Save }) {
  if (save.mediaType === "image") return <IconImage size={12} aria-hidden />;
  if (save.mediaType === "link") return <IconLink2 size={12} aria-hidden />;
  return <IconFile size={12} aria-hidden />;
}

export function SaveThumb({ save }: { save: Save }) {
  const [ai] = usePrefs("ai");
  const src = useMemo(() => {
    const unit = pickCardUnit(save);
    const candidate = unit?.isVideo ? unit.posterUrl : unit?.url;
    return candidate?.startsWith("pond://")
      ? thumbUrlFor(candidate, THUMB_SIZE * 2)
      : undefined;
  }, [save]);
  const [broken, setBroken] = useState<string | null>(null);
  const [measured, setMeasured] = useState<{
    src: string;
    aspect: number;
  } | null>(null);
  const blur = shouldBlurSensitiveThumbnail(
    ai.enableSensitiveContent && ai.blurSensitiveThumbnails,
    save.sensitiveScore,
  );
  const showImage = src !== undefined && broken !== src;
  const aspect = !showImage
    ? 1
    : measured?.src === src
      ? measured.aspect
      : aspectFor(save);
  const style: ThumbStyle = {
    "--thumb-width": Math.min(1, aspect),
    "--thumb-height": Math.min(1, 1 / aspect),
  };

  return (
    <span className={styles.slot} aria-hidden>
      <span
        className={styles.thumb}
        data-blur={blur || undefined}
        style={style}
      >
        {showImage ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={(event) =>
              setMeasured({
                src,
                aspect: clampRatio(
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                ),
              })
            }
            onError={() => setBroken(src)}
          />
        ) : (
          <SaveIcon save={save} />
        )}
      </span>
    </span>
  );
}
