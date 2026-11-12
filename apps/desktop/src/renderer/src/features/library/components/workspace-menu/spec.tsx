import {
  IconCoffee,
  IconEnvelope,
  IconGear3,
  IconRefresh,
  IconWindowDownload,
} from "@pond/icons";
import { IconGithub, IconXTwitterGlyph } from "@pond/icons/social-media";
import type { MenuItemSpec } from "@pond/ui";
import { openSettings } from "@/shared/lib/open-settings";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";

const TWITTER = "https://x.com/raphaelsalaja";
const GITHUB = "https://github.com/raphaelsalaja";
const EMAIL = "mailto:raphaelsalaja@gmail.com";
const BUY_ME_A_COFFEE = "https://buymeacoffee.com/raphaelsalaja";
/** The X mark is drawn edge to edge, so pad it to sit with the outline glyphs beside it. */
const X_MARK_VIEW_BOX = "-4 -4 32 32";

export function buildWorkspaceMenuItems({
  onBrowserExtension,
  onCheckForUpdates,
}: {
  onBrowserExtension: () => void;
  onCheckForUpdates: () => void;
}): MenuItemSpec[] {
  return [
    {
      label: "Settings",
      icon: <IconGear3 />,
      shortcut: shortcutGlyphs("app.settings"),
      onClick: () => openSettings(),
    },
    { type: "separator" },
    {
      label: "Check for Updates",
      icon: <IconRefresh />,
      onClick: onCheckForUpdates,
    },
    {
      label: "Browser Extension",
      icon: <IconWindowDownload />,
      onClick: onBrowserExtension,
    },
    { type: "separator" },
    {
      label: "Twitter",
      icon: <IconXTwitterGlyph viewBox={X_MARK_VIEW_BOX} />,
      onClick: () => void window.pond.openExternal(TWITTER),
    },
    {
      label: "GitHub",
      icon: <IconGithub />,
      onClick: () => void window.pond.openExternal(GITHUB),
    },
    {
      label: "Email",
      icon: <IconEnvelope />,
      onClick: () => void window.pond.openExternal(EMAIL),
    },
    { type: "separator" },
    {
      label: "Buy Me a Coffee",
      icon: <IconCoffee />,
      onClick: () => void window.pond.openExternal(BUY_ME_A_COFFEE),
    },
  ];
}
