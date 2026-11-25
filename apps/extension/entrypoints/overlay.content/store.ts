import { Toast } from "@pond/ui/toast";
import type { CaptureStatus } from "@/utils/outcome";
import type { OverlayRequest, OverlayToast } from "@/utils/overlay-messaging";
import type { Appearance } from "@/utils/paint-theme";

export type OverlayTool = Exclude<
  OverlayRequest,
  { view: "clear" } | { view: "toast" }
>;

export interface OverlayState {
  appearance: Appearance;
  tool: OverlayTool | null;
}

export interface ToastData {
  status: CaptureStatus;
  saveId?: string;
}

const TOAST_TIMEOUT_MS = 2500;

const HEADINGS = {
  sending: "Saving to Pond",
  saved: "Saved to Pond",
  duplicate: "Already in Pond",
  failed: "Couldn't save",
  offline: "Pond isn't running",
} satisfies Record<CaptureStatus, string>;

const OFFLINE_HINT = "Open Pond on your computer, then try again.";

export type OverlayStore = ReturnType<typeof createOverlayStore>;

export function createOverlayStore() {
  let state: OverlayState = {
    appearance: { theme: null, mode: null },
    tool: null,
  };
  const listeners = new Set<() => void>();
  const toasts = Toast.createToastManager<ToastData>();
  /**
   * The manager only notifies current subscribers. The overlay accepts the
   * first capture message before the toast provider's effect subscribes, so
   * hold the toast and replay it when that subscriber attaches.
   */
  const held = new Map<string, Parameters<typeof toasts.add>[0]>();
  let subscribers = 0;
  const listen = toasts[" subscribe"].bind(toasts);
  toasts[" subscribe"] = (listener) => {
    const stop = listen(listener);
    subscribers += 1;
    if (subscribers === 1) {
      for (const options of held.values()) toasts.add(options);
    }
    return () => {
      stop();
      subscribers -= 1;
    };
  };

  const set = (next: Partial<OverlayState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const toast = (input: OverlayToast) => {
    const options = {
      title: HEADINGS[input.status],
      description:
        input.message ??
        (input.status === "offline" ? OFFLINE_HINT : input.title),
      timeout: input.status === "sending" ? 0 : TOAST_TIMEOUT_MS,
      data: { status: input.status, saveId: input.saveId },
    };
    const current = held.get(input.id);
    if (current) {
      const next = { ...current, ...options };
      held.set(input.id, next);
      if (subscribers > 0) toasts.update(input.id, options);
      return;
    }
    const created = {
      ...options,
      id: input.id,
      onRemove: () => {
        held.delete(input.id);
      },
    };
    held.set(input.id, created);
    if (subscribers > 0) toasts.add(created);
  };

  return {
    toasts,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    show(request: OverlayRequest, appearance: Appearance) {
      if (request.view === "clear") {
        held.clear();
        if (subscribers > 0) toasts.close();
        set({ tool: null });
        return;
      }
      set({ appearance });
      if (request.view === "toast") {
        toast(request.toast);
        return;
      }
      set({ tool: request });
    },
    closeTool() {
      set({ tool: null });
    },
  };
}
