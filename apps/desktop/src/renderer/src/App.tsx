import { Toast, Tooltip, useToast } from "@pond/ui";
import { useEffect, useMemo, useRef } from "react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { PondApi } from "../../preload";
import { ThemeApplier } from "./components/theme-applier";
import { SaveCompleteToast } from "./effects/save-complete-toast";
import { UndoRedoBridge } from "./effects/undo-redo-bridge";
import { ViewShortcuts } from "./effects/view-shortcuts";
import { getPrefsSnapshot } from "./pool/prefs";
import { buildRoutes } from "./routes";

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

export function App() {
  const router = useMemo(
    () => createMemoryRouter(buildRoutes(), { initialEntries: ["/"] }),
    [],
  );

  return (
    <Tooltip.Provider>
      <Toast.Provider>
        <ThemeApplier />
        <ViewShortcuts />
        <UndoRedoBridge />
        <ToastChime />
        <SaveCompleteToast />
        <RouterProvider router={router} />
      </Toast.Provider>
    </Tooltip.Provider>
  );
}
