import {
  createContext,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  HudBarVariant,
  HudHost,
} from "@/features/saves/components/viewers/hud";
import { useViewerToolbarHost } from "@/features/saves/state/viewer-toolbar";
import styles from "./styles.module.css";

type Slot = "top" | "bottom";

interface ChromeSlots {
  enabled: boolean;
  root: HTMLElement | null;
  top: HTMLElement;
  bottom: HTMLElement;
}

const ChromeContext = createContext<ChromeSlots | null>(null);

/** The viewer root, so full screen keeps the toolbars portaled into its slots. */
export function useViewerChromeRoot(): HTMLElement | null {
  return use(ChromeContext)?.root ?? null;
}

export function useViewerChromeEnabled(): boolean {
  return use(ChromeContext)?.enabled ?? true;
}

export function ChromePortal({
  slot,
  children,
}: {
  slot: Slot;
  children: ReactNode;
}) {
  const chrome = use(ChromeContext);
  if (chrome?.enabled === false) {
    return null;
  }
  if (chrome) {
    return createPortal(children, chrome[slot]);
  }
  return (
    <div className={styles.fallback} data-slot={slot}>
      {children}
    </div>
  );
}

/** Slots exist before the first commit so stage layout effects measure the final chrome, not an inline fallback. */
function useSlots() {
  const [slots] = useState(() => ({
    top: createSlot("top"),
    bottom: createSlot("bottom"),
  }));
  const attach = useCallback(
    (firstBar: HTMLDivElement | null) => {
      const root = firstBar?.parentElement;
      if (!root) {
        return;
      }
      for (const slot of [slots.top, slots.bottom]) {
        const bar = root.querySelector(
          `:scope > [data-bar="${slot.dataset.slot}"]`,
        );
        if (bar && slot.parentElement !== bar) {
          bar.append(slot);
        }
      }
    },
    [slots],
  );
  return [slots, attach] as const;
}

function createSlot(slot: Slot) {
  const tools = document.createElement("div");
  tools.className = styles.tools ?? "";
  tools.dataset.slot = slot;
  return tools;
}

/** The main window's viewer lifts its top bar into the window toolbar; full screen and previews keep it in place. */
function useLiftTopSlot(
  root: HTMLElement | null,
  top: HTMLElement,
  enabled: boolean,
) {
  const host = useViewerToolbarHost();
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!root) {
      return;
    }
    const sync = () => setFullscreen(document.fullscreenElement === root);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [root]);

  const lifted =
    enabled && !fullscreen && root?.closest('[data-slot="center"]')
      ? host
      : null;

  useLayoutEffect(() => {
    if (!lifted || !root) {
      return;
    }
    const home = root.querySelector(':scope > [data-bar="top"]');
    lifted.append(top);
    return () => {
      if (home?.isConnected) {
        home.append(top);
      } else {
        top.remove();
      }
    };
  }, [lifted, root, top]);

  return lifted !== null;
}

export function ViewerChrome({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [{ top, bottom }, attachSlots] = useSlots();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const lifted = useLiftTopSlot(root, top, enabled);

  return (
    <ChromeContext value={{ enabled, root, top, bottom }}>
      <HudBarVariant value={lifted ? "plain" : "raised"}>
        <div
          ref={setRoot}
          className={styles.root}
          data-chrome={enabled || undefined}
          data-viewer-root
        >
          {enabled ? (
            <div className={styles.top} data-bar="top" ref={attachSlots} />
          ) : null}
          <div className={styles.stage}>
            <HudHost enabled={enabled}>{children}</HudHost>
          </div>
          {enabled ? <div className={styles.bottom} data-bar="bottom" /> : null}
        </div>
      </HudBarVariant>
    </ChromeContext>
  );
}
