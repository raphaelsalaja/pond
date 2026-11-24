import { useId, useRef, useState } from "react";
import type { ComponentProps, ReactNode, RefObject } from "react";
import { Button } from "../button";
import { Input } from "../input";
import { DialogParts as Dialog } from "./dialog";
import { useDialogSubmit } from "./use-dialog-submit";

type ButtonVariant = ComponentProps<typeof Button>["variant"];

export interface PromptOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  confirmVariant?: ButtonVariant;
  placeholder?: string;
  inputType?: "text" | "password";
  autoComplete?: string;
  initialValue?: string;
  emptyError?: string;
  onConfirm: (value: string) => void | Promise<void>;
}

const handle = Dialog.createHandle<PromptOptions & { requestId: number }>();
let requestId = 0;

export function prompt(options: PromptOptions): void {
  handle.openWithPayload({ ...options, requestId: ++requestId });
}

export function PromptDialogHost() {
  const pending = useRef(false);

  return (
    <Dialog.Root
      handle={handle}
      onOpenChange={(_, details) => {
        if (pending.current) {
          details.cancel();
        }
      }}
    >
      {({ payload }) =>
        payload ? (
          <PromptContent
            key={payload.requestId}
            options={payload}
            pending={pending}
          />
        ) : null
      }
    </Dialog.Root>
  );
}

function PromptContent({
  options,
  pending,
}: {
  options: PromptOptions;
  pending: RefObject<boolean>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const field = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(options.initialValue ?? "");
  const [empty, setEmpty] = useState(false);
  const { busy, error, submit } = useDialogSubmit(pending, () =>
    handle.close(),
  );
  const message = empty
    ? (options.emptyError ?? "Enter a value to continue.")
    : error;
  return (
    <Dialog.Portal>
      <Dialog.Backdrop />
      <Dialog.Popup>
        <form
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            if (!value.trim()) {
              setEmpty(true);
              field.current?.focus();
              return;
            }
            void submit(() => options.onConfirm(value));
          }}
        >
          <Dialog.Header>
            <Dialog.Title id={titleId}>{options.title}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content>
            {options.description ? (
              <Dialog.Description id={descriptionId}>
                {options.description}
              </Dialog.Description>
            ) : null}
            <Input.Root size="md">
              <Input.Field
                ref={field}
                aria-labelledby={titleId}
                aria-describedby={
                  [
                    options.description ? descriptionId : null,
                    message ? errorId : null,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                aria-invalid={empty || undefined}
                value={value}
                onValueChange={(next) => {
                  setValue(next);
                  if (next.trim()) {
                    setEmpty(false);
                  }
                }}
                type={options.inputType}
                autoComplete={options.autoComplete}
                placeholder={options.placeholder}
                disabled={busy}
                autoFocus
              />
            </Input.Root>
            {message ? (
              <Dialog.Description id={errorId} role="alert" data-error>
                {message}
              </Dialog.Description>
            ) : null}
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel disabled={busy} />
            <Button
              type="submit"
              variant={options.confirmVariant ?? "primary"}
              disabled={busy}
              loading={busy}
            >
              {options.confirmLabel ?? "Confirm"}
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}
