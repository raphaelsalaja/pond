import { useId, useRef, useState } from "react";
import type { ComponentProps, ReactNode, RefObject } from "react";
import { Button } from "../button";
import { Checkbox } from "../checkbox";
import { DialogParts as Dialog } from "./dialog";
import { useDialogSubmit } from "./use-dialog-submit";
import styles from "./styles.module.css";

type ButtonVariant = ComponentProps<typeof Button>["variant"];

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  confirmVariant?: ButtonVariant;
  checkbox?: {
    label: ReactNode;
    defaultChecked?: boolean;
  };
  onConfirm: (result: { checked: boolean }) => void | Promise<void>;
}

const handle = Dialog.createAlertHandle<
  ConfirmOptions & { requestId: number }
>();
let requestId = 0;

export function confirm(options: ConfirmOptions): void {
  handle.openWithPayload({ ...options, requestId: ++requestId });
}

export function ConfirmDialogHost() {
  const pending = useRef(false);

  return (
    <Dialog.Root
      variant="alert"
      handle={handle}
      onOpenChange={(_, details) => {
        if (pending.current) details.cancel();
      }}
    >
      {({ payload }) =>
        payload ? (
          <ConfirmContent
            key={payload.requestId}
            options={payload}
            pending={pending}
          />
        ) : null
      }
    </Dialog.Root>
  );
}

function ConfirmContent({
  options,
  pending,
}: {
  options: ConfirmOptions;
  pending: RefObject<boolean>;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const checkboxId = useId();
  const [checked, setChecked] = useState(
    options.checkbox?.defaultChecked ?? false,
  );
  const { busy, error, submit } = useDialogSubmit(pending, () =>
    handle.close(),
  );
  return (
    <Dialog.Portal>
      <Dialog.Backdrop />
      <Dialog.Popup initialFocus={cancelRef} aria-busy={busy}>
        <Dialog.Header>
          <Dialog.Title>{options.title}</Dialog.Title>
        </Dialog.Header>
        <Dialog.Content>
          {options.description ? (
            <Dialog.Description>{options.description}</Dialog.Description>
          ) : null}
          {options.checkbox ? (
            <label className={styles.option} htmlFor={checkboxId}>
              <Checkbox.Root
                id={checkboxId}
                checked={checked}
                disabled={busy}
                onCheckedChange={setChecked}
              >
                <Checkbox.Indicator />
              </Checkbox.Root>
              <span>{options.checkbox.label}</span>
            </label>
          ) : null}
          {error ? (
            <Dialog.Description role="alert" data-error>
              {error}
            </Dialog.Description>
          ) : null}
        </Dialog.Content>
        <Dialog.Footer>
          <Dialog.Cancel ref={cancelRef} disabled={busy} />
          <Button
            variant={options.confirmVariant ?? "destructive"}
            disabled={busy}
            loading={busy}
            onClick={() => void submit(() => options.onConfirm({ checked }))}
          >
            {options.confirmLabel ?? "Confirm"}
          </Button>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
