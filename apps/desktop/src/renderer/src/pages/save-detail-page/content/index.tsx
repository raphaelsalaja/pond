import { useMemo } from "react";
import { getYouTubeChapters } from "@/components/save-preview/helpers";
import { MediaViewer } from "@/components/save-preview/media-viewer";
import { buildMediaUnits } from "@/pool/media";
import { useResolvedTheme } from "@/pool/theme";
import type { Save } from "@/pool/types";
import { HeroVideo } from "./hero-video";
import styles from "./styles.module.css";

interface DetailContentProps {
  save: Save;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}

export function DetailContent({ save, videoRef }: DetailContentProps) {
  const theme = useResolvedTheme();
  const units = useMemo(() => buildMediaUnits(save, { theme }), [save, theme]);
  // HeroVideo is the single-stream player (YouTube / TikTok / single IG
  // reel) with chapters and full-bleed framing. Anything multi-slide —
  // mixed image+video carousels, IG carousels of N videos — needs the
  // carousel UI with prev/next nav.
  const useHero = units.length === 1 && units[0]?.isVideo === true;

  const chapters = useMemo(
    () =>
      useHero && save.source === "youtube"
        ? getYouTubeChapters(save)
        : undefined,
    [save, useHero],
  );

  return (
    <div className={styles["card-inner"]}>
      {useHero ? (
        <HeroVideo save={save} chapters={chapters} videoRef={videoRef} />
      ) : (
        <div className={styles["media-frame"]}>
          <MediaViewer save={save} videoRef={videoRef} />
        </div>
      )}
    </div>
  );
}
