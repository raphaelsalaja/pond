import { Notification } from "electron";
import log from "electron-log/main.js";

export interface SaveLink {
  url: string;
  tags: Array<string>;
  folderId: string | null;
}

const TRIGGER = "shortcut:save";
const WINDOW_MS = 60_000;
/** A site you allowed to open `pond://` could otherwise fill the Library with links. */
const MAX_PER_WINDOW = 20;

export function parseSaveLink(link: URL): SaveLink | null {
  const raw = link.searchParams.get("url");
  if (!raw) return null;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return null;
  const tags = (link.searchParams.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return {
    url: target.href,
    tags,
    folderId: link.searchParams.get("folder") || null,
  };
}

interface SaveLinkDeps {
  enqueue: (url: string, opts: { trigger: string }) => Promise<{ id: string }>;
  addTags: (
    ids: Array<string>,
    names: Array<string>,
    reason: string,
  ) => Promise<number>;
  addToFolder: (
    folderId: string,
    saveIds: Array<string>,
  ) => Promise<{ ok: boolean }>;
  notify: (title: string, body: string) => void;
  now: () => number;
  ready: () => Promise<void>;
}

export function createSaveLinkHandler(deps: SaveLinkDeps) {
  const recent: Array<number> = [];
  return async (link: SaveLink): Promise<void> => {
    const now = deps.now();
    while (recent.length > 0 && now - (recent[0] ?? now) >= WINDOW_MS) {
      recent.shift();
    }
    if (recent.length >= MAX_PER_WINDOW) {
      log.warn("[pond deep-link] save rate limited", link.url);
      return;
    }
    recent.push(now);
    const host = new URL(link.url).hostname;
    await deps.ready();
    try {
      const { id } = await deps.enqueue(link.url, { trigger: TRIGGER });
      if (link.tags.length > 0) await deps.addTags([id], link.tags, TRIGGER);
      if (link.folderId) await deps.addToFolder(link.folderId, [id]);
      deps.notify("Saved to Pond", host);
    } catch (error) {
      log.warn("[pond deep-link] save failed", link.url, error);
      deps.notify("Pond can't save that link", host);
    }
  };
}

/** A cold launch from a link delivers it before the Library and database are open. */
const libraryReady = Promise.withResolvers<void>();

export function markSaveLinksReady(): void {
  libraryReady.resolve();
}

/** Core modules load on first use so the deep-link router stays light at startup. */
export const handleSaveLink = createSaveLinkHandler({
  enqueue: async (url, opts) => (await import("./ops")).enqueue(url, opts),
  addTags: async (ids, names, reason) =>
    (await import("./core/tags")).addTagsToSaves(ids, names, reason),
  addToFolder: async (folderId, saveIds) =>
    (await import("./core/folders")).addSavesToFolder(folderId, saveIds),
  notify: (title, body) =>
    new Notification({ title, body, silent: true }).show(),
  now: Date.now,
  ready: () => libraryReady.promise,
});
