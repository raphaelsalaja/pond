import { Toast as Base } from "@base-ui-components/react/toast";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { getPrefsSnapshot } from "../pool/prefs";
import styles from "./toast.module.css";

/**
 * Optional category tag that lets the Notifications settings page
 * silence specific kinds without touching every call site.
 *
 *   useToast().add({ title: "Saved", category: "saveComplete" });
 *
 * Untagged toasts always show — that keeps system-critical messages
 * (boot errors, executor failures) from being silenced by accident.
 */
export type NotificationCategory =
  | "saveComplete"
  | "refreshFailed"
  | "aiSuggestion"
  | "videoDone";

/**
 * Mount once near the React root. Pairs with `useToast()` to push
 * notifications from anywhere (settings flash, optimistic mutation
 * results, etc).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Base.Provider>
      {children}
      <Base.Viewport className={styles.viewport}>
        <ToastList />
      </Base.Viewport>
    </Base.Provider>
  );
}

interface PondToastInput {
  title?: string;
  description?: string;
  type?: "success" | "error" | "info" | "warning";
  category?: NotificationCategory;
  /** Forwarded straight to Base.useToastManager().add. */
  [key: string]: unknown;
}

/**
 * Returns a thin wrapper around Base UI's manager whose `add()` call
 * checks the Notifications prefs (and plays a single chime when the
 * `sound` switch is on). The rest of the Base API is forwarded
 * untouched so the existing callers (`update`, `close`, etc) keep
 * working.
 */
export function useToast() {
  const manager = Base.useToastManager();
  return useMemo(() => {
    const wrapped = {
      ...manager,
      add(input: PondToastInput) {
        const prefs = getPrefsSnapshot()?.notifications;
        if (input.category && prefs && prefs[input.category] === false) {
          return null;
        }
        if (prefs?.sound) playChime();
        const { category: _category, ...rest } = input;
        return manager.add(rest);
      },
    };
    return wrapped as typeof manager & {
      add: (input: PondToastInput) => ReturnType<typeof manager.add> | null;
    };
  }, [manager]);
}

/**
 * Tiny WebAudio chime. Avoids shipping an audio asset and dodges
 * `<audio>` autoplay quirks. Squelches itself if WebAudio is
 * unavailable (test runners, very old Electrons).
 */
let chimeCtx: AudioContext | null = null;
function playChime() {
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

/** Re-export the namespace for advanced consumers. */
export const Toast = Base;

/* ------------------------------------------------------------------ */
/* Internals — render the queued toasts.                              */
/* ------------------------------------------------------------------ */

function ToastList() {
  const { toasts } = Base.useToastManager();
  return toasts.map((toast) => (
    <Base.Root
      key={toast.id}
      toast={toast}
      className={styles.popup}
      data-type={toast.type ?? "info"}
    >
      <div className={styles.body}>
        {toast.title ? <Base.Title className={styles.title} /> : null}
        {toast.description ? (
          <Base.Description className={styles.description} />
        ) : null}
      </div>
      <Base.Close className={styles.close} aria-label="Close">
        ×
      </Base.Close>
    </Base.Root>
  ));
}
