import { Toast } from "@pond/ui";
import { useEffect, useState } from "react";
import styles from "./styles.module.css";

interface ImportData {
  progress: { value: number; max: number; detail: string };
}

const TOTAL = 1876;

function ToastList() {
  const { toasts } = Toast.useToastManager<ImportData>();
  return (
    <Toast.Viewport className={styles.viewport}>
      {toasts.map((toast) => (
        <Toast.Root key={toast.id} toast={toast}>
          <Toast.Content>
            <Toast.Header>
              <Toast.Title>{toast.title}</Toast.Title>
              {toast.data ? (
                <>
                  <Toast.Progress
                    aria-label="Import progress"
                    max={toast.data.progress.max}
                    value={toast.data.progress.value}
                  />
                  <Toast.Meta>{toast.data.progress.detail}</Toast.Meta>
                </>
              ) : null}
            </Toast.Header>
            <Toast.Close />
          </Toast.Content>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  );
}

/** Mounts a live import toast that counts up while the scene is on screen. */
export function ImportToast() {
  const [manager] = useState(() => Toast.createToastManager<ImportData>());

  useEffect(() => {
    let value = 1204;
    const progress = (count: number) => ({
      value: count,
      max: TOTAL,
      detail: `Instagram saved posts · ${count.toLocaleString("en-US")} of ${TOTAL.toLocaleString("en-US")}`,
    });
    const id = manager.add({
      title: "Importing Data Export",
      timeout: 0,
      data: { progress: progress(value) },
    });
    const timer = window.setInterval(() => {
      value = value >= TOTAL ? 1204 : Math.min(TOTAL, value + 17);
      manager.update(id, { data: { progress: progress(value) } });
    }, 240);
    return () => {
      window.clearInterval(timer);
      manager.close(id);
    };
  }, [manager]);

  return (
    <Toast.Provider toastManager={manager} limit={1}>
      <ToastList />
    </Toast.Provider>
  );
}
