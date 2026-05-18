import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useIsVideoDownloading } from "@/pool/downloads";
import { pickPrimaryUnit } from "@/pool/media";
import { useResolvedTheme } from "@/pool/theme";
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
import { Video } from "./video";

interface RootProps {
  save: Save;
  layout?: CardLayout;
  selection?: CardSelection;
  children: ReactNode;
}

function Root({ save, layout, selection, children }: RootProps) {
  const theme = useResolvedTheme();
  const unit = useMemo(() => pickPrimaryUnit(save, { theme }), [save, theme]);
  const isDownloading = useIsVideoDownloading(save);
  const pickedSrc = unit?.url ?? null;

  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = brokenSrc !== null && brokenSrc === pickedSrc;

  const setBroken = useCallback(
    (next: boolean) => {
      setBrokenSrc(next ? pickedSrc : null);
    },
    [pickedSrc],
  );

  const value = useMemo<CardContextValue>(
    () => ({
      state: { save, unit, isBroken: broken, isDownloading },
      actions: { setBroken },
    }),
    [save, unit, broken, isDownloading, setBroken],
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

export const Card = {
  Root,
  Media,
  Image,
  Video,
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
