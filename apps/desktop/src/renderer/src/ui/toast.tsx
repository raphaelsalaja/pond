import { Toast as Base } from "@base-ui-components/react/toast";
import type { ReactNode } from "react";
import styles from "./toast.module.css";

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

/**
 * Returns the toast manager. Call `add({ title, description, type })` to
 * show a toast. The `type` controls the visual variant ("success",
 * "error", "info"); we map it to a `data-type` attribute on the popup
 * for CSS styling.
 */
export function useToast() {
  return Base.useToastManager();
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
