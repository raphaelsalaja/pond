import { useVideo } from "@pond/ui";
import type { ReactEventHandler } from "react";
import { BlurHash } from "@/features/saves/components/card/media/blur-hash";
import styles from "./styles.module.css";

/** Sits under the video through the first-frame reveal, so opening a video never shows an empty box. */
function Start({
  src,
  hash,
  covered,
  onLoad,
}: {
  src?: string;
  hash?: string | null;
  covered: boolean;
  onLoad?: ReactEventHandler<HTMLImageElement>;
}) {
  return (
    <div
      className={styles.placeholder}
      data-covered={covered || undefined}
      data-video-placeholder
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={styles.image}
          decoding="sync"
          draggable={false}
          onLoad={onLoad}
        />
      ) : hash ? (
        <BlurHash hash={hash} />
      ) : null}
    </div>
  );
}

function End({ src }: { src?: string }) {
  const { state } = useVideo();
  if (!src || !state.ended) return null;
  return <img src={src} alt="" className={styles.poster} draggable={false} />;
}

export const Poster = { Start, End };
