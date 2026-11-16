import type { ReactNode } from "react";
import type { ComponentDocs } from "../shared/docs";
import { Video } from ".";

/** No `src`, so examples stay offline and never autoplay; the fill stands in for a frame. */
const PLACEHOLDER = {
  height: "auto",
  aspectRatio: "16 / 9",
  background: "var(--ds-background-tertiary)",
  borderRadius: "var(--ds-radius-md)",
};

function Frame({ children }: { children: ReactNode }) {
  return <div style={{ width: 400 }}>{children}</div>;
}

export const docs: ComponentDocs = {
  slug: "video",
  name: "Video",
  tier: "composite",
  summary:
    "A video player built from parts: the media, a seek bar, time, volume, speed and full screen.",
  parts: [
    {
      name: "Video.Root",
      description:
        "Owns playback state. `chrome` keeps controls in flow and visible; without it they overlay and hide while playing.",
    },
    {
      name: "Video.Media",
      description: "The `<video>` element. Named Video by default.",
    },
    { name: "Video.Controls", description: "The controls layer." },
    { name: "Video.Row", description: "One row of controls." },
    {
      name: "Video.PlayButton",
      description: "Play or Pause, named for the action.",
    },
    {
      name: "Video.MuteButton",
      description: "Mute or Unmute, named for the action.",
    },
    {
      name: "Video.Scrubber",
      description: "The seek slider, with an optional hover preview.",
    },
    { name: "Video.CurrentTime", description: "Elapsed time." },
    { name: "Video.Duration", description: "Total time." },
    {
      name: "Video.TimeDisplay",
      description: "Elapsed and total time together.",
    },
    {
      name: "Video.SpeedSelect",
      description: "A native select for playback speed.",
    },
    {
      name: "Video.FullscreenButton",
      description:
        "Enters or exits full screen. Hidden when the browser can't.",
    },
    {
      name: "Video.Spacer",
      description: "Pushes the controls after it to the end of the row.",
    },
  ],
  keyboard: [
    {
      keys: "Tab",
      action: "Moves through Play, Seek, Mute, speed and Full screen",
    },
    { keys: "Enter / Space", action: "Activates the focused button" },
    {
      keys: "ArrowRight / ArrowLeft",
      action: "Nudges the seek position on the slider",
    },
    { keys: "Shift + Arrow / PageUp / PageDown", action: "Seeks 10 seconds" },
    { keys: "Home / End", action: "Seeks to the start or the end" },
  ],
  accessibility: [
    'The root is a `role="group"` named Video Player. Pass `aria-label` with the save title to rename it.',
    "`Video.Media` is named Video. Pass `aria-label` to rename it.",
    "Every control has a name. Play, Mute and Full screen rename themselves to the action they'll take.",
    "The seek slider reads its value as elapsed time of total time.",
    "The player has no shortcuts of its own, so Space on the player doesn't toggle playback. The host app binds media keys.",
    "Overlay controls show on focus and stay up while focus is inside the player.",
  ],
  examples: [
    {
      name: "Player",
      render: () => (
        <Frame>
          <Video.Root chrome>
            <Video.Media style={PLACEHOLDER} />
            <Video.Controls>
              <Video.Row>
                <Video.PlayButton />
                <Video.CurrentTime />
                <Video.Scrubber />
                <Video.Duration />
                <Video.MuteButton />
                <Video.SpeedSelect />
                <Video.FullscreenButton />
              </Video.Row>
            </Video.Controls>
          </Video.Root>
        </Frame>
      ),
    },
    {
      name: "Minimal",
      render: () => (
        <Frame>
          <Video.Root chrome aria-label="Kiladalen Roofline">
            <Video.Media style={PLACEHOLDER} aria-label="Kiladalen Roofline" />
            <Video.Controls>
              <Video.Row>
                <Video.PlayButton />
                <Video.Scrubber />
                <Video.MuteButton />
              </Video.Row>
            </Video.Controls>
          </Video.Root>
        </Frame>
      ),
    },
  ],
};
