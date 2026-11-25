import { useVideo } from "@pond/ui";
import { useEffect, useState } from "react";

/**
 * True once the video's first frame is on screen.
 * @remarks `loadeddata` can fire a frame before the decoded frame is composited, so it is only the fallback.
 */
export function useFirstFrame(src: string): boolean {
  const { meta } = useVideo();
  const [frameSource, setFrameSource] = useState<string | null>(null);
  useEffect(() => {
    const video = meta.videoRef.current;
    if (!video) return;
    const reveal = () => setFrameSource(src);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      reveal();
      return;
    }
    if (video.requestVideoFrameCallback) {
      const frame = video.requestVideoFrameCallback(reveal);
      return () => video.cancelVideoFrameCallback(frame);
    }
    video.addEventListener("loadeddata", reveal, { once: true });
    return () => video.removeEventListener("loadeddata", reveal);
  }, [meta.videoRef, src]);
  return frameSource === src;
}
