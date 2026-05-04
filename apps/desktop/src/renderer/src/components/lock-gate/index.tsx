import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "../../pool/prefs";
import { Button } from "../../ui";
import styles from "./styles.module.css";

/**
 * Soft app-lock gate. Reads `prefs.security` and:
 *
 *   - On first paint, prompts Touch ID if `touchIdOnLaunch` is on.
 *   - Tracks idle time via mouse / keyboard listeners; flips into
 *     locked state when `autoLockMinutes` is hit.
 *   - The locked surface covers the whole window with a single
 *     "Unlock" button; clicking it re-prompts Touch ID (or just
 *     unlocks if Touch ID isn't available — this is a soft gate, not
 *     a security boundary).
 *
 * Renders `null` (fragment-only) when unlocked so the rest of the
 * shell can mount normally.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const [prefs] = usePrefs("security");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  // First-paint Touch ID gate. We treat any failure as "stay locked"
  // — the user can manually retry from the lock surface.
  useEffect(() => {
    if (!prefs.touchIdOnLaunch) return;
    let cancelled = false;
    setLocked(true);
    void (async () => {
      const r = (await window.pond.query("security.promptTouchId", {
        reason: "Unlock Pond",
      })) as { ok: boolean };
      if (!cancelled && r.ok) setLocked(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [prefs.touchIdOnLaunch]);

  // Idle-timer auto-lock. We register cheap activity listeners and
  // reset a timer; if the timer fires we flip to locked. `null`
  // disables auto-lock.
  useEffect(() => {
    if (prefs.autoLockMinutes === null) return;
    const ms = prefs.autoLockMinutes * 60_000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setLocked(true), ms);
    };
    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "wheel",
      "touchstart",
      "click",
    ];
    for (const e of events)
      window.addEventListener(e, reset, { passive: true });
    reset();
    return () => {
      if (timer) clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [prefs.autoLockMinutes]);

  const unlock = useCallback(async () => {
    setBusy(true);
    try {
      const r = (await window.pond.query("security.promptTouchId", {
        reason: "Unlock Pond",
      })) as { ok: boolean; reason?: string };
      if (r.ok || r.reason === "unsupported") setLocked(false);
    } finally {
      setBusy(false);
    }
  }, []);

  if (!locked) return <>{children}</>;

  return (
    <>
      {children}
      <div className={styles.gate} aria-modal="true" role="dialog">
        <div className={styles.card}>
          <h1 className={styles.title}>Pond is locked</h1>
          <p className={styles.subtitle}>
            Authenticate to return to your library.
          </p>
          <Button onClick={() => void unlock()} disabled={busy}>
            {busy ? "Authenticating…" : "Unlock"}
          </Button>
        </div>
      </div>
    </>
  );
}
