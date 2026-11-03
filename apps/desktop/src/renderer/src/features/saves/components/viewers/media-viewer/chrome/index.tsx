import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { HudHost } from "@/features/saves/components/viewers/hud";
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

export function ChromePortal({
  slot,
  children,
}: {
  slot: Slot;
  children: ReactNode;
}) {
  const chrome = use(ChromeContext);
  if (chrome?.enabled === false) return null;
  if (chrome) return createPortal(children, chrome[slot]);
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
      if (!root) return;
      for (const slot of [slots.top, slots.bottom]) {
        const bar = root.querySelector(
          `:scope > [data-bar="${slot.dataset.slot}"]`,
        );
        if (bar && slot.parentElement !== bar) bar.append(slot);
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

export function ViewerChrome({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const [{ top, bottom }, attachSlots] = useSlots();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  return (
    <ChromeContext value={{ enabled, root, top, bottom }}>
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
    </ChromeContext>
  );
}
