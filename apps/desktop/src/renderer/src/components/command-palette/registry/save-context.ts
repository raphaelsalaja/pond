import type { Command } from "./types";

export const SAVE_CONTEXT_COMMANDS: Command[] = [
  {
    id: "save.open-detail",
    label: "Open in detail view",
    group: "Save",
    scope: "saves",
    keywords: ["open", "detail", "view"],
    when: (ctx) => !!ctx.focusedSaveId,
    perform: ({ navigate, focusedSaveId, close }) => {
      if (!focusedSaveId) return;
      navigate(`/detail/${focusedSaveId}`, { viewTransition: true });
      close();
    },
  },
  {
    id: "save.open-reader",
    label: "Open in reader",
    group: "Save",
    scope: "saves",
    keywords: ["read", "article", "reader"],
    when: (ctx) => !!ctx.focusedSaveId,
    perform: ({ navigate, focusedSaveId, close }) => {
      if (!focusedSaveId) return;
      navigate(`/read/${focusedSaveId}`, { viewTransition: true });
      close();
    },
  },
  {
    id: "save.reveal",
    label: "Reveal in Finder",
    group: "Save",
    scope: "saves",
    keywords: ["reveal", "finder", "explorer", "open"],
    when: (ctx) => !!ctx.focusedSaveId,
    perform: async ({ pond, focusedSaveId, close }) => {
      if (!focusedSaveId) return;
      close();
      await pond.revealSave(focusedSaveId);
    },
  },
  {
    id: "save.open-with-default",
    label: "Open with default app",
    group: "Save",
    scope: "saves",
    keywords: ["open", "default"],
    when: (ctx) => !!ctx.focusedSaveId,
    perform: async ({ pond, focusedSaveId, close }) => {
      if (!focusedSaveId) return;
      close();
      await pond.openSaveFile(focusedSaveId);
    },
  },
  {
    id: "save.copy-url",
    label: "Copy URL",
    group: "Save",
    scope: "saves",
    keywords: ["copy", "url", "link"],
    when: (ctx) => !!ctx.focusedSave?.url,
    perform: async ({ focusedSave, toast, close }) => {
      if (!focusedSave?.url) return;
      await navigator.clipboard.writeText(focusedSave.url);
      toast.success("URL copied");
      close();
    },
  },
  {
    id: "save.open-original",
    label: "Open original URL",
    description: "Open the source page in your browser",
    group: "Save",
    scope: "saves",
    keywords: ["open", "url", "external", "browser"],
    when: (ctx) => !!ctx.focusedSave?.url,
    perform: async ({ pond, focusedSave, close }) => {
      if (!focusedSave?.url) return;
      close();
      await pond.openExternal(focusedSave.url);
    },
  },
  {
    id: "save.refresh",
    label: "Refresh metadata",
    group: "Save",
    scope: "saves",
    keywords: ["refresh", "metadata", "rescrape"],
    when: (ctx) => !!ctx.focusedSaveId,
    perform: async ({ pond, focusedSaveId, toast, close }) => {
      if (!focusedSaveId) return;
      close();
      const r = await pond.refreshSave(focusedSaveId);
      if (r.ok) toast.success("Metadata refreshed");
      else toast.warn(`Refresh failed: ${r.reason.replace("_", " ")}`);
    },
  },
  {
    id: "save.context-menu",
    label: "Show context menu",
    group: "Save",
    scope: "saves",
    keywords: ["context", "menu", "right click"],
    when: (ctx) => !!ctx.focusedSaveId,
    perform: async ({ pond, focusedSaveId, close }) => {
      if (!focusedSaveId) return;
      close();
      await pond.showSaveContextMenu(focusedSaveId);
    },
  },
];
