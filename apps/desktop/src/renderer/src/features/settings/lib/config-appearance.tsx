import {
  AppearanceRow,
  customColorsVisible,
  ThemeColorRow,
  ThemeContrastRow,
  ThemePresetRow,
} from "@/features/settings/components/sections/appearance";
import { AppIconRow } from "@/features/settings/components/sections/appearance/app-icon";
import { SoundPreferences } from "@/features/settings/components/sections/general/feedback";
import {
  defineCustomSection,
  group,
} from "@/features/settings/lib/engine-types";

export const appearanceSection = defineCustomSection({
  title: "Appearance",
  description: "App icon, theme, colors, sounds, and accessibility.",
  groups: [
    group.prefs("preferences", {
      title: "Theme",
      fullWidth: true,
      items: [
        {
          control: "custom",
          key: "appearance-mode",
          render: (b) => <AppearanceRow binding={b} />,
        },
        {
          control: "custom",
          key: "light-preset",
          visible: (v) => v.appearance !== "dark",
          render: (b) => <ThemePresetRow binding={b} side="light" />,
        },
        {
          control: "custom",
          key: "light-accent",
          visible: (v) =>
            v.appearance !== "dark" && customColorsVisible("light")(v),
          render: (b) => (
            <ThemeColorRow binding={b} side="light" field="accent" />
          ),
        },
        {
          control: "custom",
          key: "light-background",
          visible: (v) =>
            v.appearance !== "dark" && customColorsVisible("light")(v),
          render: (b) => (
            <ThemeColorRow binding={b} side="light" field="background" />
          ),
        },
        {
          control: "custom",
          key: "light-foreground",
          visible: (v) =>
            v.appearance !== "dark" && customColorsVisible("light")(v),
          render: (b) => (
            <ThemeColorRow binding={b} side="light" field="foreground" />
          ),
        },
        {
          control: "custom",
          key: "light-contrast",
          visible: (v) =>
            v.appearance !== "dark" && customColorsVisible("light")(v),
          render: (b) => <ThemeContrastRow binding={b} side="light" />,
        },
        {
          control: "custom",
          key: "dark-preset",
          visible: (v) => v.appearance !== "light",
          render: (b) => <ThemePresetRow binding={b} side="dark" />,
        },
        {
          control: "custom",
          key: "dark-accent",
          visible: (v) =>
            v.appearance !== "light" && customColorsVisible("dark")(v),
          render: (b) => (
            <ThemeColorRow binding={b} side="dark" field="accent" />
          ),
        },
        {
          control: "custom",
          key: "dark-background",
          visible: (v) =>
            v.appearance !== "light" && customColorsVisible("dark")(v),
          render: (b) => (
            <ThemeColorRow binding={b} side="dark" field="background" />
          ),
        },
        {
          control: "custom",
          key: "dark-foreground",
          visible: (v) =>
            v.appearance !== "light" && customColorsVisible("dark")(v),
          render: (b) => (
            <ThemeColorRow binding={b} side="dark" field="foreground" />
          ),
        },
        {
          control: "custom",
          key: "dark-contrast",
          visible: (v) =>
            v.appearance !== "light" && customColorsVisible("dark")(v),
          render: (b) => <ThemeContrastRow binding={b} side="dark" />,
        },
      ],
    }),
    group.prefs("window", {
      title: "App Icon",
      fullWidth: true,
      items: [
        {
          control: "custom",
          key: "app-icon",
          title: "App Icon",
          keywords: [
            "dock",
            "icon",
            "tint",
            "aqua",
            "crayon",
            "taskbar",
            "brand",
          ],
          render: (b) => <AppIconRow binding={b} />,
        },
      ],
    }),
    group.prefs("preferences", {
      title: "Cards",
      items: [
        {
          control: "select",
          key: "tweetCover",
          title: "Post Cover",
          description: "Cover image for X and Threads posts.",
          keywords: [
            "twitter",
            "x",
            "threads",
            "screenshot",
            "media",
            "thumbnail",
          ],
          options: [
            { value: "media", label: "Media" },
            { value: "screenshot", label: "Screenshot" },
          ],
        },
      ],
    }),
    group.prefs("preferences", {
      title: "Sounds",
      items: [
        {
          control: "custom",
          key: "sounds",
          keywords: ["audio", "click", "feedback", "sfx", "mute", "silence"],
          standalone: true,
          render: () => <SoundPreferences />,
        },
      ],
    }),
    group.prefs("preferences", {
      title: "Accessibility",
      items: [
        {
          control: "select",
          key: "reduceMotion",
          title: "Reduce Motion",
          description: "Tone down animations and transitions.",
          options: [
            { value: "system", label: "Match System" },
            { value: "always", label: "Always Reduce" },
            { value: "never", label: "Never Reduce" },
          ],
        },
      ],
    }),
  ],
});
