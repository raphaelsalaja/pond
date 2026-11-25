import {
  IconArrowBackToBottomLeft,
  IconFullScreen,
  IconMediaPlay,
} from "@pond/icons";
import { useVideo } from "@pond/ui";
import { ViewerHud } from "@/features/saves/components/viewers/hud";
import { ShortcutKeys } from "@/shared/components/shortcut-keys";
import { usePrefs } from "@/shared/state/prefs";

function LoopButton({
  range,
  override,
  onRangeChange,
  onOverrideChange,
}: {
  range: [number, number] | null;
  override: boolean | null;
  onRangeChange: (range: [number, number] | null) => void;
  onOverrideChange: (enabled: boolean) => void;
}) {
  const [prefs] = usePrefs("viewer");
  const { state } = useVideo();
  const automaticLoop =
    !range &&
    prefs.loopShortVideos !== false &&
    state.duration > 0 &&
    state.duration < 30;
  const looped = !!range || (override ?? automaticLoop);
  return (
    <ViewerHud.Tool
      label="Loop"
      pressed={looped}
      onClick={() => {
        if (range) onRangeChange(null);
        onOverrideChange(!looped);
      }}
    >
      <IconArrowBackToBottomLeft />
    </ViewerHud.Tool>
  );
}

function PlaybackButton() {
  const { state, actions } = useVideo();
  return (
    <ViewerHud.Tool
      label={state.playing ? "Pause" : "Play"}
      shortcut={<ShortcutKeys id="viewer.play-pause" />}
      onClick={actions.togglePlay}
    >
      {state.playing ? <PauseIcon /> : <IconMediaPlay />}
    </ViewerHud.Tool>
  );
}

function PauseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      data-pause-icon
    >
      <line
        x1="6"
        y1="4"
        x2="6"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="4"
        x2="12"
        y2="14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FullscreenButton() {
  const { state, actions } = useVideo();
  if (!state.fullscreenSupported) return null;
  return (
    <ViewerHud.Pill>
      <ViewerHud.Tool
        label={state.fullscreen ? "Exit full screen" : "Full screen"}
        onClick={actions.toggleFullscreen}
      >
        <IconFullScreen />
      </ViewerHud.Tool>
    </ViewerHud.Pill>
  );
}

export const PlayerButton = {
  Loop: LoopButton,
  Playback: PlaybackButton,
  Fullscreen: FullscreenButton,
};
