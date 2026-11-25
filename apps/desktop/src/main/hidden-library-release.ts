/** A quick reopen keeps the live renderer; after this the reopen rebuilds it. */
export const HIDDEN_LIBRARY_GRACE_MS = 60_000;

export interface HiddenLibraryWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isFocused(): boolean;
}

export interface HiddenLibraryReleaseDeps<W extends HiddenLibraryWindow> {
  isLibraryWindow(win: W): boolean;
  /** False while Pond would quit without the window or something still needs its renderer. */
  canRelease(): boolean;
  release(win: W): void;
  graceMs?: number;
}

export function createHiddenLibraryRelease<W extends HiddenLibraryWindow>(
  deps: HiddenLibraryReleaseDeps<W>,
) {
  const graceMs = deps.graceMs ?? HIDDEN_LIBRARY_GRACE_MS;
  let pending: { win: W; timer: NodeJS.Timeout } | null = null;
  let stopped = false;

  function cancel(): void {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
  }

  function arm(win: W): void {
    cancel();
    const timer = setTimeout(() => {
      pending = null;
      settle(win);
    }, graceMs);
    timer.unref();
    pending = { win, timer };
  }

  function settle(win: W): void {
    if (stopped || win.isDestroyed() || !deps.isLibraryWindow(win)) return;
    if (win.isVisible() || win.isFocused()) return;
    if (!deps.canRelease()) {
      arm(win);
      return;
    }
    deps.release(win);
  }

  return {
    hidden(win: W): void {
      if (stopped || !deps.isLibraryWindow(win)) return;
      arm(win);
    },
    shown(win: W): void {
      if (pending?.win === win) cancel();
    },
    stop(): void {
      stopped = true;
      cancel();
    },
  };
}
