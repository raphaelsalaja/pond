import { VideoPlayer } from "@/components/video-player";
import type { ChapterCue } from "@/components/video-player/chapters-vtt";
import type { Save, SaveFile } from "@/pool/types";
import { buildPondUrl } from "@/pool/url";
import styles from "./styles.module.css";

interface HeroVideoProps {
  save: Save;
  chapters?: readonly ChapterCue[];
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onError?: () => void;
}

export function HeroVideo({
  save,
  chapters,
  videoRef,
  onError,
}: HeroVideoProps) {
  const files = save.files ?? [];
  const video = files.find((f) => f.kind === "video");
  if (!video) return null;
  const poster = pickPoster(files);

  const src = buildPondUrl(save.id, video);
  const posterUrl = poster ? buildPondUrl(save.id, poster) : undefined;

  return (
    <div className={styles["hero-frame"]}>
      <VideoPlayer
        key={src}
        src={src}
        poster={posterUrl}
        save={save}
        videoRef={videoRef}
        chapters={chapters}
        onError={onError}
      />
    </div>
  );
}

function pickPoster(files: SaveFile[]): SaveFile | null {
  return (
    files.find((f) => f.kind === "poster") ??
    files.find((f) => f.kind === "cover") ??
    null
  );
}
