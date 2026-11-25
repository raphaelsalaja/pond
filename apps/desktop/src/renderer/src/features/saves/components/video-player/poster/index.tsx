import { useVideo } from "@pond/ui";
import type { ReactEventHandler } from "react";
import styles from "./styles.module.css";

/** Sits under the video until its first frame shows, so opening a video never shows an empty box. */
function Start({
  src,
  covered,
  onLoad,
}: {
  src?: string;
  covered: boolean;
  onLoad?: ReactEventHandler<HTMLImageElement>;
}) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      className={styles.placeholder}
      data-covered={covered || undefined}
      decoding="sync"
      draggable={false}
      onLoad={onLoad}
    />
  );
}

function End({ src }: { src?: string }) {
  const { state } = useVideo();
  if (!src || !state.ended) return null;
  return <img src={src} alt="" className={styles.poster} draggable={false} />;
}

export const Poster = { Start, End };
