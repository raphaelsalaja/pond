import { useEffect, useState } from "react";
import {
  HashRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import type { PondApi } from "../../preload";
import { BulkActionBar } from "./components/bulk-action-bar";
import { CommandPalette } from "./components/command-palette";
import { FilterBar } from "./components/filter-bar";
import { HeaderToolbar } from "./components/header-toolbar";
import { LockGate } from "./components/lock-gate";
import { MediaLightbox } from "./components/media-lightbox";
import { PreviewPane } from "./components/preview-pane";
import { QuickCapture } from "./components/quick-capture";
import { Sidebar } from "./components/sidebar";
import { ThemeApplier } from "./components/theme-applier";
import { ActivityPage } from "./pages/activity";
import { InboxPage } from "./pages/inbox";
import { ItemDetail } from "./pages/item-detail";
import { ReaderPage } from "./pages/reader";
import { SavesView } from "./pages/saves-view";
import { SettingsPage } from "./pages/settings";
import { TrashView } from "./pages/trash-view";
import { WelcomePage } from "./pages/welcome";
import { hydratePool, subscribeToSyncActions } from "./pool/bootstrap";
import { ToastProvider, TooltipProvider } from "./ui";

declare global {
  interface Window {
    pond: PondApi;
  }
}

interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
}

export function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void window.pond.appInfo().then(setInfo);
    subscribeToSyncActions();
    void hydratePool().then(() => setReady(true));
    void window.pond.query("settings.onboarded").then((v) => {
      setOnboarded(Boolean(v));
    });
  }, []);

  return (
    <TooltipProvider>
      <ToastProvider>
        <HashRouter>
          <ThemeApplier />
          <LockGate>
            <Shell info={info} ready={ready} onboarded={onboarded} />
          </LockGate>
        </HashRouter>
      </ToastProvider>
    </TooltipProvider>
  );
}

function Shell({
  info,
  ready,
  onboarded,
}: {
  info: AppInfo | null;
  ready: boolean;
  onboarded: boolean | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [filtersVisible, setFiltersVisible] = useState(true);
  useEffect(() => {
    const off = window.pond.onNavigate((path) => navigate(path));
    return off;
  }, [navigate]);
  useEffect(() => {
    // First-run redirect. We only auto-push once we've actually
    // received the onboarded flag (it comes back async).
    if (onboarded === false) navigate("/welcome", { replace: true });
  }, [onboarded, navigate]);
  // Cmd/Ctrl+, → Settings, the macOS-standard "Preferences…" hotkey.
  // Listens at the window so it fires from any focus context, including
  // inputs (matching native behaviour).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key !== ",") return;
      e.preventDefault();
      navigate("/settings");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const isMac = info?.platform === "darwin";

  // Settings is a takeover view (no library sidebar / preview pane),
  // mirroring the Linear pattern. The page itself owns the column
  // that hosts the macOS traffic lights — see SettingsPage's left
  // rail.
  const isTakeover = location.pathname.startsWith("/settings");

  if (isTakeover) {
    return (
      <div className={`pond-shell ${isMac ? "pond-shell--mac" : ""}`.trim()}>
        <div className="pond-takeover">
          <Routes>
            <Route path="/settings/*" element={<SettingsPage />} />
          </Routes>
        </div>
        <CommandPalette />
      </div>
    );
  }

  // Welcome / Item detail / Reader mount in the shell but hide the
  // library toolbar + filter rail — they're single-purpose surfaces
  // that own their own chrome.
  const showLibraryChrome =
    !location.pathname.startsWith("/welcome") &&
    !location.pathname.startsWith("/item") &&
    !location.pathname.startsWith("/read");

  return (
    <div className={`pond-shell ${isMac ? "pond-shell--mac" : ""}`.trim()}>
      <Sidebar />
      <main className="pond-main">
        {showLibraryChrome ? (
          <HeaderToolbar
            filtersVisible={filtersVisible}
            onToggleFilters={() => setFiltersVisible((v) => !v)}
          />
        ) : null}
        {/* Filter rail lives inside the centre column (Eagle layout)
         * so it doesn't visually overlap the sidebar or preview pane.
         * The toolbar's funnel button still hides it via
         * `filtersVisible`. */}
        {showLibraryChrome && filtersVisible ? <FilterBar /> : null}
        {ready ? (
          <Routes>
            <Route path="/" element={<SavesView />} />
            <Route
              path="/source/:source"
              element={<SavesView mode="source" />}
            />
            <Route path="/trash" element={<TrashView />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/item/:id" element={<ItemDetail />} />
            <Route path="/read/:id" element={<ReaderPage />} />
            <Route path="/welcome" element={<WelcomePage />} />
          </Routes>
        ) : (
          <p className="pond-empty">Hydrating library…</p>
        )}
      </main>
      {/* Inspector is the third column. Always mounted on library
       * routes so the three-column layout (sidebar | content |
       * inspector) is stable even before anything is selected. */}
      {showLibraryChrome ? <PreviewPane /> : null}
      <MediaLightbox />
      <BulkActionBar />
      <QuickCapture />
      <CommandPalette />
    </div>
  );
}
