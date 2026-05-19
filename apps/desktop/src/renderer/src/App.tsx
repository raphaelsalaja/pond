import { Toast, Tooltip, useToast } from "@pond/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { PondApi } from "../../preload";
import { ThemeApplier } from "./components/theme-applier";
import { SaveCompleteToast } from "./effects/save-complete-toast";
import { TabShortcuts } from "./effects/tab-shortcuts";
import { UndoRedoBridge } from "./effects/undo-redo-bridge";
import { ViewShortcuts } from "./effects/view-shortcuts";
import { getPrefsSnapshot } from "./pool/prefs";
import { buildRoutes } from "./routes";
import { useTabStore } from "./stores/tabs";

// Cap on how many tabs stay mounted at the same time. Each live tab
// keeps a full router tree, grid, and component state in memory; once
// the user is past this many, the least-recently-active ones get
// evicted. Reactivating an evicted tab re-mounts it from its
// persisted path (one-off cost, then it's live again).
const LIVE_TAB_CAP = 10;

type MemoryRouter = ReturnType<typeof createMemoryRouter>;

function ToastChime() {
  const { toasts } = useToast();
  const last = useRef(toasts.length);
  useEffect(() => {
    if (toasts.length > last.current) {
      if (getPrefsSnapshot()?.notifications?.sound) playChime();
    }
    last.current = toasts.length;
  }, [toasts.length]);
  return null;
}

let chimeCtx: AudioContext | null = null;
function playChime(): void {
  try {
    if (!chimeCtx) {
      const Ctx =
        (window as unknown as { AudioContext?: typeof AudioContext })
          .AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      chimeCtx = new Ctx();
    }
    const ctx = chimeCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    /* swallow — chime is decorative */
  }
}

declare global {
  interface Window {
    pond: PondApi;
  }
}

const routerCache = new Map<string, MemoryRouter>();

function getOrCreateRouter(tabId: string, initialPath: string): MemoryRouter {
  let router = routerCache.get(tabId);
  if (!router) {
    router = createMemoryRouter(buildRoutes(), {
      initialEntries: [initialPath],
    });
    routerCache.set(tabId, router);
  }
  return router;
}

export function getRouterForTab(tabId: string): MemoryRouter | undefined {
  return routerCache.get(tabId);
}

export function removeRouterForTab(tabId: string): void {
  const router = routerCache.get(tabId);
  if (router) {
    router.dispose();
    routerCache.delete(tabId);
  }
}

function TabContent({ tabId, path }: { tabId: string; path: string }) {
  const router = useMemo(() => getOrCreateRouter(tabId, path), [tabId, path]);
  const updatePath = useTabStore((s) => s.updatePath);

  useEffect(() => {
    const unsubscribe = router.subscribe(
      (state: { location: { pathname: string; search: string } }) => {
        updatePath(tabId, state.location.pathname + state.location.search);
      },
    );
    return unsubscribe;
  }, [router, tabId, updatePath]);

  return <RouterProvider router={router} />;
}

export function App() {
  const tabs = useTabStore((s) => s.tabs);
  const activeId = useTabStore((s) => s.activeId);

  useEffect(() => {
    const currentIds = new Set(tabs.map((t) => t.id));
    for (const id of routerCache.keys()) {
      if (!currentIds.has(id)) {
        removeRouterForTab(id);
      }
    }
  }, [tabs]);

  // LRU bookkeeping: an ordered list of tab ids, most-recently-active
  // first. Tabs beyond LIVE_TAB_CAP get evicted from `liveIds` and
  // their router is disposed so RAM stays bounded with many tabs.
  const lruRef = useRef<string[]>([activeId]);
  const [liveIds, setLiveIds] = useState<Set<string>>(
    () => new Set([activeId]),
  );

  useEffect(() => {
    const existing = new Set(tabs.map((t) => t.id));
    const next = [
      activeId,
      ...lruRef.current.filter((id) => id !== activeId && existing.has(id)),
    ];
    // Also include any tabs we've never seen so newly-opened tabs
    // are immediately live; they slot in right after the active one.
    for (const t of tabs) {
      if (!next.includes(t.id)) next.push(t.id);
    }
    lruRef.current = next;

    const live = new Set(next.slice(0, LIVE_TAB_CAP));
    for (const id of routerCache.keys()) {
      if (!live.has(id)) removeRouterForTab(id);
    }
    setLiveIds((prev) => {
      if (prev.size === live.size) {
        let same = true;
        for (const id of live) {
          if (!prev.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return prev;
      }
      return live;
    });
  }, [activeId, tabs]);

  return (
    <Tooltip.Provider>
      <Toast.Provider>
        <ThemeApplier />
        <TabShortcuts />
        <ViewShortcuts />
        <UndoRedoBridge />
        <ToastChime />
        <SaveCompleteToast />
        {tabs.map((tab) =>
          liveIds.has(tab.id) ? (
            <div
              key={tab.id}
              style={{ display: tab.id === activeId ? "contents" : "none" }}
            >
              <TabContent tabId={tab.id} path={tab.path} />
            </div>
          ) : null,
        )}
      </Toast.Provider>
    </Tooltip.Provider>
  );
}
