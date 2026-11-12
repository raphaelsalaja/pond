import { stepPlaybackRate, stepVolume, useVideo } from "@pond/ui";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useEffect, useLayoutEffect, useRef } from "react";
import { useMediaSession } from "@/features/saves/hooks/use-media-session";
import { viewerMemory } from "@/features/saves/lib/viewer-memory";
import { useActiveVideo } from "@/features/saves/state/active-video";
import { bindingKeys, useShortcutBindings } from "@/shared/lib/shortcuts";
import { patchPrefsSection, usePrefs } from "@/shared/state/prefs";

const ARROW_KEY_OWNER = [
  "input",
  "textarea",
  "select",
  "button",
  "a[href]",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='button']",
  "[role='combobox']",
  "[role='listbox']",
  "[role='menu']",
  "[role='menuitem']",
  "[role='option']",
  "[role='searchbox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='tab']",
  "[role='textbox']",
].join(", ");

/** Focused fields, sliders, and other controls keep arrow keys for themselves. */
function controlOwnsArrowKeys(event: KeyboardEvent): boolean {
  const owns = (node: EventTarget | null) =>
    node instanceof Element && node.closest(ARROW_KEY_OWNER) != null;
  if (owns(document.activeElement) || owns(event.target)) return true;
  return event.composedPath().some((node) => owns(node));
}

export function MediaBridge({
  src,
  active,
  title,
  artist,
  artworkUrl,
  loopRange,
  loopOverride,
}: {
  src: string;
  active: boolean;
  title?: string | null;
  artist?: string | null;
  artworkUrl?: string;
  loopRange: [number, number] | null;
  loopOverride: boolean | null;
}) {
  const [prefs, , prefsReady] = usePrefs("viewer");
  const applyingMute = useRef(false);
  const videoMutedRef = useRef(prefs.videoMuted);
  videoMutedRef.current = prefs.videoMuted;
  const shortcuts = useShortcutBindings();
  const lastSavedSecond = useRef(-1);
  const restored = useRef(false);
  const { state, actions, meta } = useVideo();
  const { seek, seekBy, play, pause } = actions;
  const { currentTime, playing, duration, rate } = state;
  useEffect(() => {
    if (!meta.videoRef.current) return;
    const automaticLoop =
      prefs.loopShortVideos !== false && duration > 0 && duration < 30;
    meta.videoRef.current.loop = !loopRange && (loopOverride ?? automaticLoop);
  }, [duration, loopOverride, meta.videoRef, prefs.loopShortVideos, loopRange]);

  useEffect(() => {
    if (!active || !playing || !loopRange || loopRange[1] > duration) return;
    const video = meta.videoRef.current;
    if (!video) return;
    let request = 0;
    const loop = () => {
      if (video.currentTime >= loopRange[1] || video.currentTime < loopRange[0])
        video.currentTime = loopRange[0];
      request = requestAnimationFrame(loop);
    };
    request = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(request);
  }, [active, playing, loopRange, duration, meta.videoRef]);

  useEffect(() => {
    const video = meta.videoRef.current;
    if (!active || !video || !loopRange || loopRange[1] > duration) return;
    const restart = () => {
      video.currentTime = loopRange[0];
      void video.play().catch(() => {});
    };
    video.addEventListener("ended", restart);
    return () => video.removeEventListener("ended", restart);
  }, [active, loopRange, duration, meta.videoRef]);

  useEffect(() => {
    if (restored.current || duration <= 0) return;
    restored.current = true;
    if (prefs.rememberPlayback !== false) {
      const position = viewerMemory.playback(src);
      if (position > 0 && position < duration - 1) seek(position);
    }
  }, [duration, prefs.rememberPlayback, seek, src]);
  useEffect(() => {
    if (prefs.rememberPlayback === false || !restored.current || duration <= 0)
      return;
    const position = meta.videoRef.current?.currentTime ?? currentTime;
    const second = Math.floor(position);
    if (second !== lastSavedSecond.current) {
      lastSavedSecond.current = second;
      viewerMemory.setPlayback(src, position >= duration - 1 ? 0 : position);
    }
  }, [currentTime, duration, prefs.rememberPlayback, src, meta.videoRef]);
  useHotkey(
    bindingKeys(shortcuts, "viewer.play-pause"),
    (event) => {
      event.preventDefault();
      actions.showControls();
      actions.togglePlay();
    },
    { enabled: active, ignoreInputs: true },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.frame-prev"),
    () => actions.stepFrame(-1),
    {
      enabled: active,
      ignoreInputs: true,
    },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.frame-next"),
    () => actions.stepFrame(1),
    {
      enabled: active,
      ignoreInputs: true,
    },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.frame-prev-ten"),
    () => actions.stepFrame(-10),
    { enabled: active, ignoreInputs: true },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.frame-next-ten"),
    () => actions.stepFrame(10),
    { enabled: active, ignoreInputs: true },
  );
  useActiveVideo(active);
  useHotkey(
    bindingKeys(shortcuts, "viewer.seek-back"),
    () => seekBy(-prefs.videoSeekSeconds),
    { enabled: active, ignoreInputs: true, conflictBehavior: "allow" },
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.seek-forward"),
    () => seekBy(prefs.videoSeekSeconds),
    { enabled: active, ignoreInputs: true, conflictBehavior: "allow" },
  );
  const videoHotkeys = { enabled: active, ignoreInputs: true };
  useHotkey(
    bindingKeys(shortcuts, "viewer.speed-up"),
    () => actions.setRate(stepPlaybackRate(rate, 1)),
    videoHotkeys,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.speed-down"),
    () => actions.setRate(stepPlaybackRate(rate, -1)),
    videoHotkeys,
  );
  const nudgeVolume = (delta: number) => {
    const video = meta.videoRef.current;
    if (!video) return;
    const next = stepVolume(video.volume, delta);
    // Raising the level while muted should be heard. Lowering it stays muted.
    if (delta > 0 || !video.muted) actions.setVolume(next);
    else video.volume = next;
    actions.showControls();
  };
  const volumeHotkeys = {
    enabled: active,
    ignoreInputs: true,
    conflictBehavior: "allow" as const,
    preventDefault: false,
    stopPropagation: false,
  };
  useHotkey(
    bindingKeys(shortcuts, "viewer.volume-up"),
    (event) => {
      if (event.defaultPrevented || controlOwnsArrowKeys(event)) return;
      event.preventDefault();
      nudgeVolume(0.05);
    },
    volumeHotkeys,
  );
  useHotkey(
    bindingKeys(shortcuts, "viewer.volume-down"),
    (event) => {
      if (event.defaultPrevented || controlOwnsArrowKeys(event)) return;
      event.preventDefault();
      nudgeVolume(-0.05);
    },
    volumeHotkeys,
  );

  useMediaSession(
    { title, artist, artworkUrl },
    { active, playing, currentTime, duration, rate },
    { play, pause, seek, seekBy },
  );

  // One viewer preference for every preview. Volume stays on the element.
  // The M shortcut writes `muted` directly, so `volumechange` records it.
  useLayoutEffect(() => {
    const video = meta.video;
    if (!prefsReady || !video || video.muted === prefs.videoMuted) return;
    applyingMute.current = true;
    video.muted = prefs.videoMuted;
    applyingMute.current = false;
  }, [meta.video, prefs.videoMuted, prefsReady]);
  useEffect(() => {
    const video = meta.video;
    if (!video) return;
    const onVolumeChange = () => {
      if (applyingMute.current || video.muted === videoMutedRef.current) return;
      void patchPrefsSection("viewer", { videoMuted: video.muted });
    };
    video.addEventListener("volumechange", onVolumeChange);
    return () => video.removeEventListener("volumechange", onVolumeChange);
  }, [meta.video]);

  useEffect(() => {
    if (!prefsReady || !meta.video) return;
    if (active && prefs.autoplayVideo !== false) play();
    else pause();
  }, [active, meta.video, play, pause, prefs.autoplayVideo, prefsReady]);

  return null;
}
