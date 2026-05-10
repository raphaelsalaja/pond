import { Toast as Base } from "@base-ui/react/toast";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

interface ProviderProps {
  children: ReactNode;
}

function Provider({ children }: ProviderProps) {
  return (
    <Base.Provider>
      {children}
      <Base.Viewport className={styles.viewport}>
        <ToastList />
      </Base.Viewport>
    </Base.Provider>
  );
}

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

export const useToast = Base.useToastManager;

export const Toast = {
  Provider,
  Root: Base.Root,
  Title: Base.Title,
  Description: Base.Description,
  Action: Base.Action,
  useToast,
};
