import { useVideo } from "@pond/ui";
import { useEffect, useState } from "react";

/**
 * True once the video's first frame is on screen.
 * @remarks Presentation signals precede compositing, so the reveal waits two painted frames.
 */
export function useFirstFrame(src: string): boolean {
  const { meta } = useVideo();
  const [frameSource, setFrameSource] = useState<string | null>(null);
  useEffect(() => {
    const video = meta.videoRef.current;
    if (!video) return;
    let frame = 0;
    const cancel = () => cancelAnimationFrame(frame);
    const reveal = () => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setFrameSource(src));
      });
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      reveal();
      return cancel;
    }
    if (video.requestVideoFrameCallback) {
      const callback = video.requestVideoFrameCallback(reveal);
      return () => {
        video.cancelVideoFrameCallback(callback);
        cancel();
      };
    }
    video.addEventListener("loadeddata", reveal, { once: true });
    return () => {
      video.removeEventListener("loadeddata", reveal);
      cancel();
    };
  }, [meta.videoRef, src]);
  return frameSource === src;
}
