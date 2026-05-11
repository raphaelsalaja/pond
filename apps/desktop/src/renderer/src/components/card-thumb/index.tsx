import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useIsVideoDownloading } from "@/pool/downloads";
import { requestVideoHeal } from "@/pool/heal";
import { type MediaUnit, pickPrimaryUnit } from "@/pool/media";
import type { Save } from "@/pool/types";
import {
  CardContext,
  type CardContextValue,
  type CardLayout,
  type CardSelection,
} from "./context";
import { DownloadingBadge } from "./downloading-badge";
import { Image } from "./image";
import { Media } from "./media";
import { Placeholder } from "./placeholder";
import styles from "./styles.module.css";
import { Tweet } from "./tweet";
import { Video } from "./video";

interface RootProps {
  save: Save;
  layout?: CardLayout;
  selection?: CardSelection;
  children: ReactNode;
}

function Root({ save, layout, selection, children }: RootProps) {
  // `pickPrimaryUnit` walks `save.files` and runs regexes; cache it for
  // the lifetime of this `save` reference. Combined with the pool's
  // in-place patching, an unrelated tag/title edit on a different row
  // doesn't churn this card's media-unit derivation.
  const unit = useMemo(
    () => pickPrimaryUnit(save) ?? buildLegacyUnit(save),
    [save],
  );
  const isDownloading = useIsVideoDownloading(save.id);
  const pickedSrc = unit?.url ?? null;

  // Tag the broken state with the URL that errored. When the picked
  // URL changes (a heal wrote new bytes, the user re-imported, etc.)
  // the comparison auto-flips `broken` back to false — no effect, no
  // render-phase `setState`, no extra render pass.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = brokenSrc !== null && brokenSrc === pickedSrc;

  const setBroken = useCallback(
    (next: boolean) => {
      setBrokenSrc(next ? pickedSrc : null);
    },
    [pickedSrc],
  );

  const healVideo = useCallback(
    (videoSrc?: string) => {
      requestVideoHeal(save.id, videoSrc);
    },
    [save.id],
  );

  const value = useMemo<CardContextValue>(
    () => ({
      state: { save, unit, isBroken: broken, isDownloading },
      actions: { setBroken, healVideo },
    }),
    [save, unit, broken, isDownloading, setBroken, healVideo],
  );

  return (
    <CardContext value={value}>
      <div
        className={styles.thumb}
        data-layout={layout}
        data-selection={selection}
      >
        {children}
      </div>
    </CardContext>
  );
}

function buildLegacyUnit(save: Save): MediaUnit | null {
  if (save.blobUrl) {
    return {
      key: "blobUrl",
      url: save.blobUrl,
      isVideo: save.mediaType === "video",
    };
  }
  if (save.mediaUrl) {
    return {
      key: "mediaUrl",
      url: save.mediaUrl,
      isVideo:
        save.mediaType === "video" ||
        /\.(mp4|webm|mov)(\?|$)/i.test(save.mediaUrl),
    };
  }
  return null;
}

export const Card = {
  Root,
  Media,
  Image,
  Video,
  Tweet,
  Placeholder,
  DownloadingBadge,
};

export type {
  CardActions,
  CardContextValue,
  CardLayout,
  CardSelection,
  CardState,
} from "./context";
export { CardContext, useCardContext } from "./context";
export { isTextOnlyTweet } from "./tweet";
