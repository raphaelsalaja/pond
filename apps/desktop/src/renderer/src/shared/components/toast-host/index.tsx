import { IconSparkleFill } from "@pond/icons";
import { Button, Toast } from "@pond/ui";
import {
  TOAST_TIMEOUT_MS,
  type ToastAsk,
  type ToastData,
  toastManager,
} from "@/shared/lib/toast";

type ToastObject = ReturnType<
  typeof Toast.useToastManager<ToastData>
>["toasts"][number];

interface AskActionsProps {
  id: string;
  ask: ToastAsk;
  spotlight: boolean;
}

function AskActions({ id, ask, spotlight }: AskActionsProps) {
  const { close } = Toast.useToastManager();
  return (
    <Toast.Actions>
      <Button size="sm" variant="secondary" onClick={() => close(id)}>
        {ask.cancel}
      </Button>
      <Button
        size="sm"
        variant="primary"
        onClick={() => {
          close(id);
          void ask.onConfirm();
        }}
      >
        {spotlight ? <IconSparkleFill size={12} /> : null}
        {ask.confirm}
      </Button>
    </Toast.Actions>
  );
}

export function ToastItem({ toast }: { toast: ToastObject }) {
  const data = toast.data;
  const spotlight = data?.variant === "spotlight";
  return (
    <Toast.Root toast={toast} variant={data?.variant}>
      {spotlight ? <Toast.Spotlight /> : null}
      <Toast.Content>
        {data?.icon ? (
          <Toast.Icon tone={data.tone}>{data.icon}</Toast.Icon>
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
        {data?.action ? (
          <Toast.Action onClick={data.action.onClick}>
            {data.action.label}
          </Toast.Action>
        ) : null}
        {data?.ask ? (
          <AskActions id={toast.id} ask={data.ask} spotlight={spotlight} />
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
