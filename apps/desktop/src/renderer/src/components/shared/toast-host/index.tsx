import { Toast } from "@pond/ui";
import { TOAST_TIMEOUT_MS, toastManager } from "@/lib/ui/toast";

function ToastList() {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport>
        {toasts.map((toast) => (
          <Toast.Root key={toast.id} toast={toast}>
            <Toast.Content>
              <Toast.Header>
                {toast.title ? <Toast.Title>{toast.title}</Toast.Title> : null}
                <Toast.Close />
              </Toast.Header>
              {toast.description ? (
                <Toast.Description>{toast.description}</Toast.Description>
              ) : null}
            </Toast.Content>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function ToastHost() {
  return (
    <Toast.Provider toastManager={toastManager} timeout={TOAST_TIMEOUT_MS}>
      <ToastList />
    </Toast.Provider>
  );
}
