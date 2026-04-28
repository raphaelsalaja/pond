import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, useNavigate } from "react-router-dom";
import type { PondApi } from "../../preload";
import { MediaLightbox } from "./components/media-lightbox";
import { PreviewPane } from "./components/preview-pane";
import { Sidebar } from "./components/sidebar";
import { ItemDetail } from "./pages/item-detail";
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
          <Shell info={info} ready={ready} onboarded={onboarded} />
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
  useEffect(() => {
    const off = window.pond.onNavigate((path) => navigate(path));
    return off;
  }, [navigate]);
  useEffect(() => {
    // First-run redirect. We only auto-push once we've actually
    // received the onboarded flag (it comes back async).
    if (onboarded === false) navigate("/welcome", { replace: true });
  }, [onboarded, navigate]);

  const isMac = info?.platform === "darwin";
  return (
    <div className={`pond-shell ${isMac ? "pond-shell--mac" : ""}`.trim()}>
      <header className="pond-header" />
      <div className="pond-body">
        <Sidebar />
        <main className="pond-main">
          {ready ? (
            <Routes>
              <Route path="/" element={<SavesView />} />
              <Route path="/recents" element={<SavesView mode="recents" />} />
              <Route
                path="/source/:source"
                element={<SavesView mode="source" />}
              />
              <Route path="/trash" element={<TrashView />} />
              <Route path="/item/:id" element={<ItemDetail />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/welcome" element={<WelcomePage />} />
            </Routes>
          ) : (
            <p className="pond-empty">Hydrating library…</p>
          )}
        </main>
        <PreviewPane />
      </div>
      <MediaLightbox />
    </div>
  );
}
