import { Button, Toast } from "@pond/ui";
import { TOAST_TIMEOUT_MS, toastManager } from "@/shared/lib/toast";
import type { ToastAsk, ToastData } from "@/shared/lib/toast";

type ToastObject = ReturnType<
  typeof Toast.useToastManager<ToastData>
>["toasts"][number];

function AskActions({ id, ask }: { id: string; ask: ToastAsk }) {
  const { close } = Toast.useToastManager();
  return (
    <Toast.Actions>
      <Button size="sm" variant="secondary" onClick={() => close(id)}>
        {ask.cancel}
      </Button>
      <Button
        size="sm"
        variant="accent"
        onClick={() => {
          close(id);
          void ask.onConfirm();
        }}
      >
        {ask.confirm}
      </Button>
    </Toast.Actions>
  );
}

function ToastItem({ toast }: { toast: ToastObject }) {
  const data = toast.data;
  return (
    <Toast.Root toast={toast}>
      <Toast.Content>
        {data?.icon ? (
          <Toast.Icon tone={data.tone}>{data.icon}</Toast.Icon>
        ) : data?.status ? (
          <Toast.Icon>
            <Toast.Status status={data.status} />
          </Toast.Icon>
        ) : null}
        <Toast.Header>
          {toast.title ? <Toast.Title>{toast.title}</Toast.Title> : null}
          {toast.description ? (
            <Toast.Description>{toast.description}</Toast.Description>
          ) : null}
          {data?.progress ? (
            <Toast.Progress
              aria-label={data.progress.label}
              max={data.progress.max}
              value={data.progress.value}
            />
          ) : null}
          {data?.progress?.detail ? (
            <Toast.Meta>{data.progress.detail}</Toast.Meta>
          ) : null}
          {data?.note ? <Toast.Meta>{data.note}</Toast.Meta> : null}
        </Toast.Header>
        {data?.ask ? (
          <AskActions id={toast.id} ask={data.ask} />
        ) : data?.action ? (
          <Toast.Actions>
            <Toast.Action
              disabled={data.action.disabled}
              onClick={data.action.onClick}
            >
              {data.action.label}
            </Toast.Action>
          </Toast.Actions>
        ) : (
          <Toast.Close />
        )}
      </Toast.Content>
    </Toast.Root>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager<ToastData>();

  return (
    <Toast.Portal>
      <Toast.Viewport>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function ToastHost() {
  return (
    <Toast.Provider
      limit={Number.POSITIVE_INFINITY}
      toastManager={toastManager}
      timeout={TOAST_TIMEOUT_MS}
    >
      <ToastList />
    </Toast.Provider>
  );
}
