import {
  IconBookOpen,
  IconBug,
  IconCoffee,
  IconEnvelope,
  IconFileExport,
  IconGift,
  IconKeyboard,
  IconNut,
  IconRefresh,
  IconWindowDownload,
} from "@pond/icons";
import { IconGithub, IconXTwitterGlyph } from "@pond/icons/social-media";
import { Logo, Menu, type MenuItemSpec, Tooltip } from "@pond/ui";
import { useState } from "react";
import {
  exportDebugReport,
  runNewAction,
} from "@/features/library/components/new-menu/actions";
import { requestUpdateCheck } from "@/features/settings/update-check";
import { BrowserExtensionDialog } from "@/shared/components/browser-extension-dialog";
import { openSettings } from "@/shared/lib/open-settings";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { whatsNewDialog } from "@/shared/state/whats-new";

const HELP_CENTER = "https://github.com/raphaelsalaja/pond/wiki";
const ISSUES = "https://github.com/raphaelsalaja/pond/issues";
const TWITTER = "https://x.com/raphaelsalaja";
const GITHUB = "https://github.com/raphaelsalaja";
const EMAIL = "mailto:raphaelsalaja@gmail.com";
const BUY_ME_A_COFFEE = "https://buymeacoffee.com/raphaelsalaja";
/** The X mark is drawn edge to edge, so pad it to sit with the outline glyphs beside it. */
const X_MARK_VIEW_BOX = "-4 -4 32 32";

export function buildHelpMenuItems({
  onBrowserExtension,
  onCheckForUpdates,
}: {
  onBrowserExtension: () => void;
  onCheckForUpdates: () => void;
}): MenuItemSpec[] {
  return [
    {
      label: "Settings",
      icon: <IconNut />,
      shortcut: shortcutGlyphs("app.settings"),
      onClick: () => openSettings(),
    },
    {
      label: "Keyboard Shortcuts",
      icon: <IconKeyboard />,
      onClick: () => openSettings("shortcuts"),
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
      label: "Help Center",
      icon: <IconBookOpen />,
      onClick: () => void window.pond.openExternal(HELP_CENTER),
    },
    {
      label: "What's New",
      icon: <IconGift />,
      onClick: () => whatsNewDialog.open(),
    },
    {
      label: "Report an Issue",
      icon: <IconBug />,
      onClick: () => void window.pond.openExternal(ISSUES),
    },
    {
      label: "Export Debug Report",
      icon: <IconFileExport />,
      onClick: () => void runNewAction(exportDebugReport),
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

export function HelpMenu() {
  const [extensionOpen, setExtensionOpen] = useState(false);
  const items = buildHelpMenuItems({
    onBrowserExtension: () => setExtensionOpen(true),
    onCheckForUpdates: () => requestUpdateCheck(),
  });

  return (
    <>
      <Menu.Root>
        <Tooltip label="Help" side="right">
          <Menu.Trigger
            icon
            variant="ghost"
            rounding="rounded"
            aria-label="Help"
          >
            <Logo size={16} aria-hidden />
          </Menu.Trigger>
        </Tooltip>
        <Menu.Portal>
          <Menu.Positioner side="right" align="end">
            <Menu.Popup>
              <Menu.Items items={items} />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <BrowserExtensionDialog
        open={extensionOpen}
        onOpenChange={setExtensionOpen}
      />
    </>
  );
}
