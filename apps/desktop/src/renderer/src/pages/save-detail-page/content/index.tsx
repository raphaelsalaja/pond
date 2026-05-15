import { useMemo } from "react";
import { getYouTubeChapters } from "@/components/save-preview/helpers";
import { MediaViewer } from "@/components/save-preview/media-viewer";
import type { Save } from "@/pool/types";
import { HeroVideo } from "./hero-video";
import styles from "./styles.module.css";

interface DetailContentProps {
  save: Save;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onExpand?: () => void;
}

export function DetailContent({ save, videoRef, onExpand }: DetailContentProps) {
  const chapters = useMemo(
    () => (save.source === "youtube" ? getYouTubeChapters(save) : undefined),
    [save],
  );

  const hasLocalVideo = useMemo(
    () => (save.files ?? []).some((f) => f.kind === "video"),
    [save.files],
  );

  const showVideoHero = save.source === "youtube" || hasLocalVideo;

  return (
    <div className={styles["card-inner"]}>
      {showVideoHero ? (
        <HeroVideo
          save={save}
          chapters={chapters}
          videoRef={videoRef}
          onExpand={onExpand}
        />
      ) : (
        <div className={styles["media-frame"]}>
          <MediaViewer save={save} videoRef={videoRef} onExpand={onExpand} />
        </div>
      )}
    </div>
  );
}
