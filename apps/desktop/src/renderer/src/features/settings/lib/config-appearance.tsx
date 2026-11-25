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
import { IS_MAC } from "@/shared/lib/platform";

export const appearanceSection = defineCustomSection({
  title: "Appearance",
  description:
    "App icon, theme, window, colors, font, sounds, and accessibility.",
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
      title: "Window",
      visible: () => IS_MAC,
      items: [
        {
          control: "switch",
          key: "translucent",
          title: "Translucent Window",
          description: "Blurs your desktop behind the sidebar and toolbar.",
          keywords: ["vibrancy", "transparency", "blur", "glass", "material"],
        },
        {
          control: "select",
          key: "translucentMaterial",
          title: "Material",
          description: "Each macOS material blurs and darkens differently.",
          keywords: ["vibrancy", "transparency", "blur", "glass"],
          disabled: (v) => v.translucent === false,
          options: [
            { value: "sidebar", label: "Sidebar" },
            { value: "under-window", label: "Under Window" },
            { value: "hud", label: "HUD" },
            { value: "popover", label: "Popover" },
            { value: "menu", label: "Menu" },
          ],
        },
        {
          control: "range",
          key: "translucentTint",
          title: "Tint",
          description:
            "0 shows the bare material, 100 covers it with your theme.",
          keywords: ["vibrancy", "transparency", "opacity", "blur"],
          disabled: (v) => v.translucent === false,
          min: 0,
          max: 100,
          step: 5,
          suffix: "%",
        },
      ],
    }),
    group.prefs("preferences", {
      title: "Font",
      items: [
        {
          control: "range",
          key: "fontRoundness",
          title: "Roundness",
          description: "0 cuts letter ends square, 100 makes them fully round.",
          keywords: ["font", "type", "allo", "round", "sharp", "corners"],
          min: 0,
          max: 100,
          step: 1,
        },
        {
          control: "switch",
          key: "fontOpticalSizeAuto",
          title: "Automatic Optical Size",
          description: "Tunes letter shapes and spacing to each text size.",
          keywords: ["font", "type", "allo", "opsz", "spacing", "display"],
        },
        {
          control: "range",
          key: "fontOpticalSize",
          title: "Optical Size",
          description: "14 is the open text cut, 32 the tighter display cut.",
          keywords: ["font", "type", "allo", "opsz", "spacing", "display"],
          disabled: (v) => v.fontOpticalSizeAuto !== false,
          min: 14,
          max: 32,
          step: 1,
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
        {
          control: "switch",
          key: "appIconMatchesLibrary",
          title: "Match Library Logo",
          description: "Use the color of the open Library's Pond logo instead.",
          keywords: ["library", "logo", "follow", "sync", "dock"],
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
          description: "Cover image for X, Threads and Bluesky posts.",
          keywords: [
            "twitter",
            "x",
            "threads",
            "bluesky",
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
