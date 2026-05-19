import { toggleInspector } from "@/lib/use-inspector";
import { toggleSidebar } from "@/lib/use-sidebar";
import type { Command } from "./types";

export const ACTION_COMMANDS: Command[] = [
  {
    id: "view.sidebar.toggle",
    label: "Toggle sidebar",
    group: "Actions",
    scope: "actions",
    keywords: ["sidebar", "navigation", "hide", "show", "collapse"],
    shortcut: ["⌥", "⌘", "1"],
    perform: ({ close }) => {
      close();
      toggleSidebar();
    },
  },
  {
    id: "view.inspector.toggle",
    label: "Toggle inspector",
    group: "Actions",
    scope: "actions",
    keywords: ["inspector", "metadata", "hide", "show", "pane"],
    shortcut: ["⌥", "⌘", "2"],
    perform: ({ close }) => {
      close();
      toggleInspector();
    },
  },
  {
    id: "action.theme.light",
    label: "Switch to light theme",
    group: "Actions",
    scope: "actions",
    keywords: ["theme", "light", "appearance"],
    chord: ["t", "l"],
    perform: ({ setTheme, close }) => {
      setTheme("light");
      close();
    },
  },
  {
    id: "action.theme.dark",
    label: "Switch to dark theme",
    group: "Actions",
    scope: "actions",
    keywords: ["theme", "dark", "appearance", "night"],
    chord: ["t", "d"],
    perform: ({ setTheme, close }) => {
      setTheme("dark");
      close();
    },
  },
  {
    id: "action.theme.system",
    label: "Match system theme",
    group: "Actions",
    scope: "actions",
    keywords: ["theme", "system", "auto", "appearance"],
    chord: ["t", "s"],
    perform: ({ setTheme, close }) => {
      setTheme("system");
      close();
    },
  },
  {
    id: "action.quick-capture",
    label: "Quick capture",
    description: "Drop a URL into Pond",
    group: "Actions",
    scope: "actions",
    keywords: ["new", "save", "add", "capture"],
    chord: ["n", "s"],
    perform: ({ navigate, close }) => {
      navigate("/?capture=1", { viewTransition: true });
      close();
    },
  },
  {
    id: "action.undo",
    label: "Undo last action",
    group: "Actions",
    scope: "actions",
    keywords: ["revert"],
    shortcut: ["⌘", "Z"],
    perform: async ({ pond, close }) => {
      close();
      await pond.undo();
    },
  },
  {
    id: "action.redo",
    label: "Redo last action",
    group: "Actions",
    scope: "actions",
    keywords: ["repeat"],
    shortcut: ["⇧", "⌘", "Z"],
    perform: async ({ pond, close }) => {
      close();
      await pond.redo();
    },
  },
  {
    id: "action.refresh.start",
    label: "Refresh metadata for all saves",
    description: "Re-run the OG / scraper pipeline against every save",
    group: "Actions",
    scope: "actions",
    keywords: ["refresh", "metadata", "backfill", "all"],
    perform: async ({ pond, toast, close }) => {
      close();
      const r = await pond.refreshBackfillStart({});
      if (r.ok) toast.success(`Refreshing ${r.total} saves`);
      else toast.warn(`Refresh: ${r.reason.replace("_", " ")}`);
    },
  },
  {
    id: "action.refresh.cancel",
    label: "Cancel metadata refresh",
    group: "Actions",
    scope: "actions",
    keywords: ["cancel", "stop", "refresh", "backfill"],
    perform: async ({ pond, close }) => {
      close();
      await pond.refreshBackfillCancel();
    },
  },
  {
    id: "action.trash.empty",
    label: "Empty Trash",
    description: "Permanently delete every item in Trash",
    group: "Actions",
    scope: "actions",
    keywords: ["empty", "trash", "delete", "purge"],
    perform: async ({ pond, toast, close }) => {
      close();
      await pond.query("saves.emptyTrash", {});
      toast.success("Trash emptied");
    },
  },
  {
    id: "action.trash.restore-all",
    label: "Restore all from Trash",
    group: "Actions",
    scope: "actions",
    keywords: ["restore", "trash", "undelete"],
    perform: async ({ pond, toast, close }) => {
      close();
      await pond.query("saves.restoreAll", {});
      toast.success("Restored all saves from Trash");
    },
  },
  {
    id: "action.library.rescan",
    label: "Rescan library",
    description: "Re-index every item from disk",
    group: "Actions",
    scope: "actions",
    keywords: ["rescan", "library", "index", "scan"],
    perform: async ({ pond, toast, close }) => {
      close();
      await pond.query("library.rescan", {});
      toast.success("Rescan started");
    },
  },
  {
    id: "action.library.open-in-finder",
    label: "Open library in Finder",
    group: "Actions",
    scope: "actions",
    keywords: ["finder", "explorer", "library", "open", "reveal"],
    perform: async ({ pond, close }) => {
      close();
      await pond.query("library.openInFinder", {});
    },
  },
  {
    id: "action.library.verify",
    label: "Verify library integrity",
    group: "Actions",
    scope: "actions",
    keywords: ["verify", "integrity", "library", "check"],
    perform: async ({ pond, toast, close }) => {
      close();
      await pond.query("library.verifyIntegrity", {});
      toast.success("Integrity check started");
    },
  },
  {
    id: "action.library.export-zip",
    label: "Export library as ZIP",
    group: "Actions",
    scope: "actions",
    keywords: ["export", "zip", "library", "backup"],
    perform: async ({ pond, close }) => {
      close();
      await pond.query("library.exportZip", {});
    },
  },
  {
    id: "action.library.export-json",
    label: "Export library as JSON",
    group: "Actions",
    scope: "actions",
    keywords: ["export", "json", "library", "backup"],
    perform: async ({ pond, close }) => {
      close();
      await pond.query("library.exportJson", {});
    },
  },
  {
    id: "action.library.move",
    label: "Move library…",
    description: "Pick a new location for the on-disk library",
    group: "Actions",
    scope: "actions",
    keywords: ["move", "library", "relocate"],
    perform: async ({ pond, close }) => {
      close();
      await pond.query("library.move", {});
    },
  },
  {
    id: "action.backups.snapshot",
    label: "Create backup snapshot",
    group: "Actions",
    scope: "actions",
    keywords: ["backup", "snapshot", "save"],
    perform: async ({ pond, toast, close }) => {
      close();
      await pond.query("backups.snapshotNow", {});
      toast.success("Backup snapshot started");
    },
  },
  {
    id: "action.api.restart",
    label: "Restart local API",
    group: "Actions",
    scope: "actions",
    keywords: ["api", "restart", "server", "extension"],
    perform: async ({ pond, toast, close }) => {
      close();
      await pond.query("api.restart", {});
      toast.success("API restarting");
    },
  },
  {
    id: "action.developer.logs",
    label: "Open developer logs",
    group: "Actions",
    scope: "actions",
    keywords: ["logs", "debug", "developer"],
    perform: async ({ pond, close }) => {
      close();
      await pond.query("developer.openLogs", {});
    },
  },
  {
    id: "action.developer.ipc-inspector",
    label: "Open IPC inspector",
    group: "Actions",
    scope: "actions",
    keywords: ["ipc", "inspect", "debug", "developer"],
    perform: async ({ pond, close }) => {
      close();
      await pond.query("developer.openIpcInspector", {});
    },
  },
  {
    id: "action.updates.check",
    label: "Check for updates",
    group: "Actions",
    scope: "actions",
    keywords: ["update", "check", "version"],
    perform: async ({ pond, close }) => {
      close();
      await pond.query("updates.checkNow", {});
    },
  },
];
