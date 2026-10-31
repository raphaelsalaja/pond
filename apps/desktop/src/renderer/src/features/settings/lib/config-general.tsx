import {
  CheckNowRow,
  WhatsNewRow,
} from "@/features/settings/components/sections/general";
import { NotificationPreferences } from "@/features/settings/components/sections/general/feedback";
import { RaycastRow } from "@/features/settings/components/sections/general/raycast";
import { SidebarPreferences } from "@/features/settings/components/sections/general/sidebar";
import { SystemPreferences } from "@/features/settings/components/sections/general/system-preferences";
import {
  defineCustomSection,
  group,
} from "@/features/settings/lib/engine-types";

import { SHORTCUT_PLATFORM } from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";

const IS_MAC = SHORTCUT_PLATFORM === "mac";
const IS_WINDOWS = SHORTCUT_PLATFORM === "windows";

function runApply(
  channel:
    | "quickCapture.applyPrefs"
    | "system.applyPrefs"
    | "window.applyPrefs"
    | "updates.applyPrefs",
): void {
  void window.pond.query(channel, {}).catch(() =>
    notify({
      id: "settings-apply-error",
      title: "Couldn't apply this setting",
      description: "Try again or restart Pond.",
    }),
  );
}

export const generalSection = defineCustomSection({
  title: "Preferences",
  description: IS_WINDOWS
    ? "Window behavior, notification area, and updates."
    : "Window behavior, menu bar, and updates.",
  groups: [
    group.prefs("window", {
      title: "Startup",
      items: [
        {
          control: "select",
          key: "startupPage",
          title: "Startup Behavior",
          description: "Where Pond opens when you launch.",
          options: [
            { value: "continue", label: "Last Screen" },
            { value: "library", label: "Library" },
            { value: "sources", label: "Sources" },
            { value: "trash", label: "Trash" },
            { value: "settings", label: "Settings" },
          ],
        },
        {
          control: "switch",
          key: "launchAtLogin",
          title: "Launch at Login",
          description: "Start Pond when you sign in.",
          prefsKey: "quickCapture",
          apply: () => runApply("quickCapture.applyPrefs"),
        },
        {
          control: "switch",
          key: "launchHidden",
          title: "Launch in Background",
          description: "Start Pond without opening its window.",
          apply: () => runApply("window.applyPrefs"),
        },
      ],
    }),
    group.prefs("system", {
      title: "System",
      items: [
        {
          control: "select",
          key: "proxyMode",
          title: "Proxy",
          description: "How Pond reaches the network.",
          options: [
            { value: "system", label: "System Settings" },
            { value: "direct", label: "Direct" },
            { value: "manual", label: "Manual" },
          ],
          apply: () => runApply("system.applyPrefs"),
        },
        {
          control: "custom",
          key: "proxy-url",
          title: "Manual Proxy",
          visible: (v) => v.proxyMode === "manual",
          render: () => <SystemPreferences />,
        },
        {
          control: "switch",
          key: "hardwareAcceleration",
          title: "Hardware Acceleration",
          description: "Use the GPU after you restart Pond.",
          apply: () => runApply("system.applyPrefs"),
        },
        {
          control: "select",
          key: "dockVisibility",
          title: "Dock Visibility",
          description: "Stay visible, or hide when windows close.",
          visible: () => IS_MAC,
          options: [
            { value: "automatic", label: "Automatic" },
            { value: "always", label: "Always Visible" },
          ],
          apply: () => runApply("system.applyPrefs"),
        },
      ],
    }),
    group.prefs("window", {
      title: "Window",
      items: [
        {
          control: "switch",
          key: "restorePosition",
          title: "Restore Window Position",
          description: "Reopen Pond where you last left it.",
          apply: () => runApply("window.applyPrefs"),
        },
        {
          control: "switch",
          key: "closeToTray",
          title: "Keep Running When Closed",
          description: "Fetch with the window closed, until you quit.",
          apply: () => runApply("window.applyPrefs"),
        },
        {
          control: "range",
          key: "interfaceZoom",
          title: "Interface Zoom",
          description: "Doesn't change photo or video zoom.",
          min: 50,
          max: 200,
          step: 5,
          suffix: "%",
        },
      ],
    }),
    group.plain({
      items: [
        {
          control: "custom",
          key: "sidebar",
          title: "Sidebar",
          keywords: ["destinations", "counts", "double-click"],
          standalone: true,
          render: () => <SidebarPreferences />,
        },
      ],
    }),
    group.prefs("tagPicker", {
      title: "Tag Picker",
      items: [
        {
          control: "select",
          key: "layout",
          title: "Layout",
          description: "A list or grid for tagging Saves.",
          options: [
            { value: "list", label: "List" },
            { value: "grid", label: "Grid" },
          ],
        },
        {
          control: "select",
          key: "gridSize",
          title: "Grid Size",
          visible: (v) => v.layout === "grid",
          description: "Set the density of tags in the grid layout.",
          options: [
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium" },
            { value: "lg", label: "Large" },
          ],
        },
        {
          control: "switch",
          key: "showStarred",
          title: "Starred Tags",
          visible: (v) => v.layout === "grid",
          description: "Show starred tags in their own section.",
        },
        {
          control: "switch",
          key: "showRecently",
          title: "Recent Tags",
          visible: (v) => v.layout === "grid",
          description: "Show tags you used recently.",
        },
        {
          control: "switch",
          key: "showRecommended",
          title: "Recommended Tags",
          description: "Local suggestions for the selected Saves.",
        },
        {
          control: "switch",
          key: "showCounts",
          title: "Tag Counts",
          description: "Show how many Saves use each tag.",
        },
        {
          control: "switch",
          key: "pinned",
          title: "Keep Tag Picker Open",
          description: "Stays open while you tag more than one Save.",
        },
      ],
    }),
    group.plain({
      title: "Notifications",
      items: [
        {
          control: "custom",
          key: "notifications",
          title: "Notifications",
          keywords: ["alerts", "extension", "auto import"],
          standalone: true,
          render: () => <NotificationPreferences />,
        },
      ],
    }),
    group.prefs("quickCapture", {
      title: IS_WINDOWS ? "Notification Area" : "Menu Bar",
      items: [
        {
          control: "switch",
          key: "menuBarIcon",
          title: IS_WINDOWS ? "Notification Area Icon" : "Menu Bar Icon",
          description: IS_WINDOWS
            ? "Show Pond in the notification area."
            : "Show Pond in the menu bar.",
          apply: () => runApply("quickCapture.applyPrefs"),
        },
      ],
    }),
    group.plain({
      title: "Integrations",
      visible: () => IS_MAC,
      items: [
        {
          control: "custom",
          key: "raycast",
          title: "Raycast",
          keywords: ["extension", "local API", "token"],
          render: () => <RaycastRow />,
        },
      ],
    }),
    group.prefs("updates", {
      title: "Updates",
      items: [
        {
          control: "switch",
          key: "autoInstall",
          title: "Automatic Updates",
          description: "Download in the background. Apply on next launch.",
          apply: () => runApply("updates.applyPrefs"),
        },
        {
          control: "custom",
          key: "check-now",
          title: "Check for Updates",
          render: () => <CheckNowRow />,
        },
        {
          control: "custom",
          key: "whats-new",
          title: "What's New",
          keywords: ["changelog", "release notes", "version"],
          render: () => <WhatsNewRow />,
        },
      ],
    }),
  ],
});
