import { Tooltip } from "@pond/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import type { PondApi } from "../../preload";
import { ConfirmDialogHost } from "./components/shared/confirm-dialog";
import { PromptDialogHost } from "./components/shared/prompt-dialog";
import { ShortcutsSheetHost } from "./components/shared/shortcuts-sheet";
import { ToastHost } from "./components/shared/toast-host";
import { AppShell } from "./components/shell/app-shell";
import { BootScreen } from "./components/shell/boot-screen";
import { ErrorBoundary } from "./components/shell/error-boundary";
import { ErrorScreen } from "./components/shell/error-screen";
import { Toolbar } from "./components/shell/toolbar";
import { AppHotkeys } from "./effects/app-hotkeys";
import { DeveloperApplier } from "./effects/developer-applier";
import { EnrichmentSweep } from "./effects/enrichment-sweep";
import { ExtensionCaptureToast } from "./effects/extension-capture-toast";
import { MenuBridge } from "./effects/menu-bridge";
import { MenuRecentsBridge } from "./effects/menu-recents-bridge";
import { SaveHotkeys } from "./effects/save-hotkeys";
import { SyncStatusBridge } from "./effects/sync-status-bridge";
import { TabShortcuts } from "./effects/tab-shortcuts";
import { ThemeApplier } from "./effects/theme-applier";
import { UiSounds } from "./effects/ui-sounds";
import { UndoRedoBridge } from "./effects/undo-redo-bridge";
import { pondScopedKey } from "./lib/pond-scope";
import { setAppRouter } from "./lib/ui/app-router";
import { syncPrimaryFromPath } from "./lib/ui/save-nav";
import { routeTree } from "./routeTree.gen";
import { usePrefs } from "./stores/prefs";
import { settingsModal } from "./stores/settings-modal";
import { tabs, useActiveTabId, useTabs } from "./stores/tabs";

declare global {
  interface Window {
    pond: PondApi;
    __pondShell?: {
      theme?: "light" | "dark";
      baseL?: number;
      baseC?: number;
      baseH?: number;
      accentL?: number;
      accentC?: number;
      accentH?: number;
      contrast?: number;
      fgDir?: number;
      pointerCursors?: boolean;
    };
  }
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof buildRouter>;
  }
}

/** Last path is pond-scoped because a route can point at a save that exists in only one library; the startup-page mirror is app-level like the window prefs it shadows. */
const LAST_PATH_KEY = pondScopedKey("pond:lastPath");
const STARTUP_PAGE_KEY = "pond:startupPage";

const STARTUP_ROUTES: Record<string, string> = {
  library: "/",
  sources: "/sources",
  trash: "/trash",
};

function readStored(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Reads the localStorage mirror of the startup preference so the initial route resolves synchronously, before prefs finish loading over IPC. */
function initialPath(): string {
  const startup = readStored(STARTUP_PAGE_KEY) ?? "continue";
  if (startup === "settings") return "/";
  if (startup !== "continue" && STARTUP_ROUTES[startup]) {
    return STARTUP_ROUTES[startup];
  }
  const last = readStored(LAST_PATH_KEY) || "/";
  return last.startsWith("/settings") ? "/" : last;
}

function buildRouter(entry: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [entry] }),
    defaultPreload: "intent",
    defaultErrorComponent: ({ error, reset }) => (
      <ErrorScreen error={error} reset={reset} />
    ),
  });
}

function TabContent({ path }: { path: string }) {
  /** TabContent is keyed by tab id, so each activation restores from the tab store's saved path without keeping an inactive router alive. */
  const [router] = useState(() => buildRouter(path));

  useEffect(() => {
    const unsub = router.subscribe("onResolved", () => {
      const loc = router.state.location;
      const next = loc.pathname + loc.searchStr;
      const activeId = tabs.getState().activeId;
      tabs.updatePath(activeId, next);
      try {
        localStorage.setItem(LAST_PATH_KEY, loc.pathname);
      } catch {
        /** Best-effort; navigation still works without persistence. */
      }
      syncPrimaryFromPath(loc.pathname);
      setAppRouter(router);
    });
    return unsub;
  }, [router]);

  useEffect(() => {
    setAppRouter(router);
    syncPrimaryFromPath(router.state.location.pathname);
  }, [router]);

  return <RouterProvider router={router} />;
}

export function App() {
  /** Seed once before the first tab routers mount so the startup path wins over the default "/". */
  useState(() => {
    tabs.ensureInitial(initialPath());
  });

  const tabList = useTabs();
  const activeId = useActiveTabId();
  const activeTab = tabList.find((tab) => tab.id === activeId);

  /** The "settings" startup page lands on "/" and opens the modal on top. */
  useEffect(() => {
    if (readStored(STARTUP_PAGE_KEY) === "settings") settingsModal.open();
  }, []);

  /** Mirror the startup preference into localStorage so the next cold launch resolves the initial route before prefs load over IPC. */
  const [windowPrefs] = usePrefs("window");
  const startupPage = windowPrefs?.startupPage;
  useEffect(() => {
    if (!startupPage) return;
    try {
      localStorage.setItem(STARTUP_PAGE_KEY, startupPage);
    } catch {
      /** Best-effort; falls back to "continue" when unreadable. */
    }
  }, [startupPage]);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  );

  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <Tooltip.Provider>
          <ThemeApplier />
          <DeveloperApplier />
          <UiSounds />
          <UndoRedoBridge />
          <MenuBridge />
          <MenuRecentsBridge />
          <SaveHotkeys />
          <AppHotkeys />
          <TabShortcuts />
          <SyncStatusBridge />
          <ExtensionCaptureToast />
          <EnrichmentSweep />
          <BootScreen />
          <ErrorBoundary>
            <AppShell.Root header={<Toolbar />}>
              {activeTab ? (
                <TabContent key={activeTab.id} path={activeTab.path} />
              ) : null}
            </AppShell.Root>
          </ErrorBoundary>
          <ConfirmDialogHost />
          <PromptDialogHost />
          <ShortcutsSheetHost />
          <ToastHost />
        </Tooltip.Provider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
