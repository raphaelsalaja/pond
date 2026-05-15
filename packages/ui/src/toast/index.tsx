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
      <Base.Portal>
        <Base.Viewport className={styles.viewport}>
          <ToastList />
        </Base.Viewport>
      </Base.Portal>
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
      <Base.Content className={styles.content}>
        <div className={styles.body}>
          {toast.title ? <Base.Title className={styles.title} /> : null}
          {toast.description ? (
            <Base.Description className={styles.description} />
          ) : null}
        </div>
        <Base.Close className={styles.close} aria-label="Close">
          <XIcon />
        </Base.Close>
      </Base.Content>
    </Base.Root>
  ));
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export const useToast = Base.useToastManager;

export const Toast = {
  Provider,
  Root: Base.Root,
  Title: Base.Title,
  Description: Base.Description,
  Action: Base.Action,
  Close: Base.Close,
  Content: Base.Content,
  useToast,
};
