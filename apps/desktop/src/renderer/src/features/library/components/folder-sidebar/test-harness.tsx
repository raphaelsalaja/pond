import { PrefsSchema } from "@pond/schema";
import type { Folder, SavedView } from "@pond/schema/db";
import { Dialog } from "@pond/ui";
import type { FishSummary } from "@shared/fish-contracts";
import type { QueueSummary } from "@shared/queue-contracts";
import type { LibrarySidebarCounts } from "@shared/sidebar-counts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoute, RouterProvider } from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { createLibraryTestRouter } from "@/app/test/library-router";
import type { LibraryTestRouter } from "@/app/test/library-router";
import { folders } from "@/features/library/state/folders";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { savedViews } from "@/features/library/state/saved-views";
import { resetFilters } from "@/features/library/state/view-store";
import { startViewUrlSync } from "@/features/library/state/view-url";
import type { SaveDragDataTransfer } from "@/features/saves";
import { selection } from "@/features/saves/navigation";
import { ToastHost } from "@/shared/components/toast-host";
import { bridge } from "@/shared/test/pond-bridge";
import type { QueryHandlers } from "@/shared/test/pond-bridge";
import { FolderRail, FolderSidebar } from ".";

function RailAndSidebar() {
  return (
    <>
      <FolderRail />
      <FolderSidebar />
    </>
  );
}

interface SidebarFixtures {
  folders: Array<Folder>;
  savedViews: Array<SavedView>;
  fish: Array<FishSummary>;
  sidebarCounts: LibrarySidebarCounts;
  queueSummary: QueueSummary;
}

interface SidebarFixturePatch {
  folders?: Array<Folder>;
  savedViews?: Array<SavedView>;
  fish?: Array<FishSummary>;
  sidebarCounts?: Partial<LibrarySidebarCounts>;
  queueSummary?: Partial<QueueSummary>;
}

function emptyQueueSummary(): QueueSummary {
  return {
    running: 0,
    waiting: 0,
    parked: 0,
    failed: 0,
    cancelled: 0,
    dead: 0,
    actionable: 0,
  };
}

function emptySidebarCounts(): LibrarySidebarCounts {
  return {
    library: 0,
    uncategorized: 0,
    untagged: 0,
    recentlyAdded: 0,
    recentlyUsed: 0,
    splitPosts: 0,
    inbox: 0,
    inboxSnoozed: 0,
    trash: 0,
    folders: {},
    foldersDownloading: {},
  };
}

function emptyFixtures(): SidebarFixtures {
  return {
    folders: [],
    savedViews: [],
    fish: [],
    sidebarCounts: emptySidebarCounts(),
    queueSummary: emptyQueueSummary(),
  };
}

let fixtures = emptyFixtures();
let storedPrefs = PrefsSchema.parse({});

function sidebarQueries(): QueryHandlers {
  return {
    "saves.sidebarCounts": () => fixtures.sidebarCounts,
    "queue.summary": () => fixtures.queueSummary,
    "savedViews.list": () => fixtures.savedViews,
    "savedViews.create": () => ({ ok: true, id: "created" }),
    "savedViews.update": () => ({ ok: true }),
    "savedViews.rename": () => ({ ok: true }),
    "savedViews.delete": () => ({ ok: true }),
    "savedViews.reorder": () => ({ ok: true }),
    "accounts.list": () => ({ accounts: [] }),
    "watches.list": () => ({ watches: [] }),
    "tags.list": () => [],
    "tagGroups.list": () => [],
    "canvases.list": () => [],
    "fish.list": () => fixtures.fish,
    "fish.sections": () => [],
    "folders.list": () => fixtures.folders,
    "folders.memberships": () => [],
    "folders.create": ({ name, parentId }) => folder(name, parentId ?? null),
    "folders.rename": () => ({ ok: true }),
    "folders.setColor": () => ({ ok: true }),
    "folders.delete": () => ({ ok: true }),
    "folders.move": () => ({ ok: true, undoId: null }),
    "folders.moveBatch": () => ({ ok: true, undoId: null }),
    "folders.assign": () => ({ ok: true, undoId: null }),
    "folders.addSaves": () => ({ ok: true, undoId: null }),
    "folders.downloading": () => ({ count: 0 }),
    "folders.metadata.get": ({ folderId }) => ({
      folderId,
      description: null,
      externalLink: "https://example.com/project",
    }),
    "folders.metadata.set": () => ({ ok: true }),
    "library.info": () => ({
      path: "/tmp/My Pond.pond",
      name: "My Pond",
      icon: null,
      mark: null,
      accent: null,
    }),
    "library.recent": () => [],
    "libraryHealth.overview": () => ({
      check: null,
      job: null,
      media: {
        state: "idle",
        prepared: 0,
        remaining: 0,
        currentTitle: null,
        pauseReason: null,
        lastError: null,
        pendingPosters: 0,
        activeSaveIds: [],
        discovering: false,
        failures: [],
      },
      missingVideos: [],
    }),
    "settings.getPrefs": () => storedPrefs,
    "settings.setPrefs": (patch) => {
      const updates = new Map(Object.entries(patch ?? {}));
      storedPrefs = PrefsSchema.parse(
        Object.fromEntries(
          Object.entries(storedPrefs).map(([section, value]) => [
            section,
            { ...value, ...updates.get(section) },
          ]),
        ),
      );
      return { ok: true, prefs: storedPrefs };
    },
  };
}

export function folder(name: string, parentId: string | null = null): Folder {
  return {
    id: name,
    name,
    parentId,
    color: null,
    sortOrder: 0,
    createdAt: new Date(),
  };
}

export function savedView(
  id: string,
  kind: SavedView["kind"],
  parentId: string | null = null,
): SavedView {
  return {
    id,
    name: id,
    kind,
    parentId,
    query: { combinator: "and", rules: [] },
    question: null,
    sortKey: "savedAt",
    sortDir: "desc",
    layout: "waterfall",
    sortOrder: 0,
    createdAt: new Date(),
  };
}

interface FolderTransfer extends SaveDragDataTransfer {
  types: Array<string>;
  dropEffect: string;
}

export function folderTransfer(id = ""): FolderTransfer {
  const data = new Map<string, string>();
  const types: Array<string> = [];
  if (id) {
    data.set("application/x-pond-folder", id);
    types.push("application/x-pond-folder");
  }
  return {
    types,
    dropEffect: "none",
    effectAllowed: "all",
    setData(type: string, value: string) {
      data.set(type, value);
      if (!types.includes(type)) types.push(type);
    },
    getData(type: string) {
      return data.get(type) ?? "";
    },
  };
}

export function fireDrag(
  target: EventTarget,
  type: string,
  dataTransfer: ReturnType<typeof folderTransfer>,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  target.dispatchEvent(event);
}

export function createFolderSidebarHarness() {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  let router: LibraryTestRouter | null = null;
  let stopViewUrlSync: (() => void) | null = null;

  function getHost(): HTMLDivElement {
    if (!host) throw new Error("Sidebar harness isn't set up");
    return host;
  }

  return {
    get host() {
      return getHost();
    },
    get router(): LibraryTestRouter {
      if (!router) throw new Error("Sidebar harness isn't mounted");
      return router;
    },
    /** Replaces the Library the sidebar reads; counts and queue summary merge into the current values. */
    set(patch: SidebarFixturePatch): void {
      fixtures = {
        folders: patch.folders ?? fixtures.folders,
        savedViews: patch.savedViews ?? fixtures.savedViews,
        fish: patch.fish ?? fixtures.fish,
        sidebarCounts: { ...fixtures.sidebarCounts, ...patch.sidebarCounts },
        queueSummary: { ...fixtures.queueSummary, ...patch.queueSummary },
      };
    },
    get fixtures(): SidebarFixtures {
      return fixtures;
    },
    async setup(): Promise<void> {
      storedPrefs = PrefsSchema.parse({});
      fixtures = emptyFixtures();
      libraryChrome.setSidebarPanel("library");
      resetFilters();
      localStorage.removeItem("pond:collapsed-folders");
      localStorage.removeItem("pond:folder-list-sort");
      bridge.use({ performHaptic: () => {}, query: sidebarQueries() });
      await folders.refresh();
      await savedViews.refresh();
      host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
    },
    async cleanup(): Promise<void> {
      if (root) await act(async () => root?.unmount());
      stopViewUrlSync?.();
      stopViewUrlSync = null;
      host?.remove();
      root = null;
      host = null;
      router = null;
      selection.clear();
    },
    rowLabel(node: Element): string {
      return node.textContent?.replace(/[\d,]+$/, "").trim() ?? "";
    },
    button(label: string): HTMLButtonElement {
      const match = [...getHost().querySelectorAll("button")].find(
        (node) =>
          node.getAttribute("aria-label") === label ||
          (node.textContent?.replace(/[\d,]+$/, "").trim() ?? "") === label,
      );
      if (!match) throw new Error(`Missing sidebar button: ${label}`);
      return match;
    },
    iconButton(label: string): HTMLElement {
      const match = getHost().querySelector<HTMLElement>(
        `[aria-label="${label}"]`,
      );
      if (!match) {
        throw new Error(`Missing icon button: ${label}`);
      }
      return match;
    },
    menuItem(label: string): HTMLElement {
      const node = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
        ),
      ].find((item) => item.textContent?.trim() === label);
      if (!node) {
        throw new Error(`Missing menu item: ${label}`);
      }
      return node;
    },
    async mount(path = "/"): Promise<LibraryTestRouter> {
      if (!root) throw new Error("Sidebar harness isn't set up");
      const next = createLibraryTestRouter(path, {
        component: RailAndSidebar,
        routes: (library) => [
          createRoute({
            getParentRoute: () => library,
            path: "fish/$fishId",
            staticData: { details: "fish" },
          }),
        ],
      });
      router = next;
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      await act(async () => {
        await next.load();
        stopViewUrlSync = startViewUrlSync(next);
        root?.render(
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={next} />
            <Dialog.Host />
            <ToastHost />
          </QueryClientProvider>,
        );
      });
      return next;
    },
  };
}
