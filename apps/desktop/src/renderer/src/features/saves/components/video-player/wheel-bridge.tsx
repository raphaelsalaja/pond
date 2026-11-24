import { stepVolume, useVideo } from "@pond/ui";
import { useEffect, useRef } from "react";
import { usePrefs } from "@/shared/state/prefs";

export function WheelBridge() {
  const [prefs] = usePrefs("viewer");
  const { actions, meta, state } = useVideo();
  const volume = useRef(state.volume);
  useEffect(() => {
    volume.current = state.volume;
  }, [state.volume]);

  useEffect(() => {
    const video = meta.videoRef.current;
    if (!video || prefs.videoWheelBehavior === "none") {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const direction = event.deltaY > 0 ? -1 : 1;
      if (prefs.videoWheelBehavior === "volume") {
        actions.setVolume(stepVolume(volume.current, direction * 0.05));
      } else {
        actions.seekBy(-direction * 5);
      }
      actions.showControls();
    };
    video.addEventListener("wheel", onWheel, { passive: false });
    return () => video.removeEventListener("wheel", onWheel);
  }, [actions, meta.videoRef, prefs.videoWheelBehavior]);

  return null;
}
