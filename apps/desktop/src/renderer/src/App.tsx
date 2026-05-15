import { Toast, Tooltip, useToast } from "@pond/ui";
import { useEffect, useRef } from "react";
import {
  createHashRouter,
  Navigate,
  type RouteObject,
  RouterProvider,
} from "react-router-dom";
import type { PondApi } from "../../preload";
import {
  AppRoot,
  LibraryLayout,
  SettingsLayout,
  StandaloneLayout,
} from "./components/shell";
import { SaveCompleteToast } from "./effects/save-complete-toast";
import { ActivityPage } from "./pages/activity";
import { InboxPage } from "./pages/inbox";
import { ReaderPage } from "./pages/reader";
import { SaveDetailPage } from "./pages/save-detail-page";
import { SavesView } from "./pages/saves-view";
import { DEFAULT_SECTION, SECTIONS } from "./pages/settings/registry";
import { TrashView } from "./pages/trash-view";
import { WelcomePage } from "./pages/welcome";
import { getPrefsSnapshot } from "./pool/prefs";

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

const settingsChildren: RouteObject[] = [
  {
    index: true,
    element: <Navigate to={`/settings/${DEFAULT_SECTION.path}`} replace />,
  },
  ...SECTIONS.map(
    (section): RouteObject => ({
      path: section.path,
      element: <section.component />,
    }),
  ),
  {
    path: "*",
    element: <Navigate to={`/settings/${DEFAULT_SECTION.path}`} replace />,
  },
];

const saveSplitChild: RouteObject = {
  path: "save/:id",
};

const router = createHashRouter([
  {
    element: <AppRoot />,
    children: [
      {
        element: <LibraryLayout />,
        children: [
          {
            path: "/",
            element: <SavesView />,
            children: [saveSplitChild],
          },
          {
            path: "source/:source",
            element: <SavesView mode="source" />,
            children: [saveSplitChild],
          },
          {
            path: "untagged",
            element: <SavesView mode="untagged" />,
            children: [saveSplitChild],
          },
          {
            path: "recents",
            element: <SavesView mode="recents" />,
            children: [saveSplitChild],
          },
          {
            path: "random",
            element: <SavesView mode="random" />,
            children: [saveSplitChild],
          },
          {
            path: "trash",
            element: <TrashView />,
            children: [saveSplitChild],
          },
          { path: "detail/:id", element: <SaveDetailPage /> },
          {
            path: "source/:source/detail/:id",
            element: <SaveDetailPage />,
          },
          { path: "untagged/detail/:id", element: <SaveDetailPage /> },
          { path: "recents/detail/:id", element: <SaveDetailPage /> },
          { path: "random/detail/:id", element: <SaveDetailPage /> },
          { path: "trash/detail/:id", element: <SaveDetailPage /> },
          { path: "inbox", element: <InboxPage /> },
          { path: "activity", element: <ActivityPage /> },
        ],
      },
      {
        path: "settings",
        element: <SettingsLayout />,
        children: settingsChildren,
      },
      {
        element: <StandaloneLayout />,
        children: [
          { path: "welcome", element: <WelcomePage /> },
          { path: "read/:id", element: <ReaderPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <Tooltip.Provider>
      <Toast.Provider>
        <ToastChime />
        <SaveCompleteToast />
        <RouterProvider router={router} />
      </Toast.Provider>
    </Tooltip.Provider>
  );
}
