import { Toast } from "@pond/ui/toast";
import { sendMessage } from "@/utils/messaging";
import type { OverlayStore, ToastData } from "../store";
import styles from "./styles.module.css";

interface ToastsProps {
  manager: OverlayStore["toasts"];
  container: HTMLElement;
}

function List({ container }: { container: HTMLElement }) {
  const { toasts } = Toast.useToastManager<ToastData>();
  return (
    <Toast.Portal container={container}>
      <Toast.Viewport>
        {toasts.map((toast) => {
          const saveId = toast.data?.saveId;
          return (
            <Toast.Root key={toast.id} toast={toast}>
              <Toast.Content>
                <Toast.Header>
                  <Toast.Title>
                    <span
                      key={toast.data?.status}
                      className={styles.swap}
                      data-updated={(toast.updateKey ?? 0) > 0 || undefined}
                    >
                      {toast.title}
                    </span>
                  </Toast.Title>
                  {toast.description ? (
                    <Toast.Description className={styles.description}>
                      {toast.description}
                    </Toast.Description>
                  ) : null}
                </Toast.Header>
                {saveId ? (
                  <Toast.Action
                    onClick={() =>
                      void sendMessage("openPond", `item/${saveId}`)
                    }
                  >
                    Open
                  </Toast.Action>
                ) : null}
                <Toast.Close />
              </Toast.Content>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function Toasts({ manager, container }: ToastsProps) {
  return (
    <Toast.Provider toastManager={manager} limit={3}>
      <List container={container} />
    </Toast.Provider>
  );
}
