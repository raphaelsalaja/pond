import { Button, Field, Input, Popover } from "@pond/ui";
import { useRef, useState } from "react";
import styles from "./styles.module.css";

export function SavePreset({
  initialName,
  disabled,
  onSave,
}: {
  initialName: string;
  disabled: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setInvalid(true);
      field.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onSave(trimmed);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) {
          setName(initialName);
          setInvalid(false);
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger render={<Button variant="ghost" disabled={disabled} />}>
        Save Preset
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" align="start">
          <Popover.Popup className={styles.popup} initialFocus={field}>
            <form
              className={styles.form}
              aria-busy={busy}
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Field.Root invalid={invalid || undefined}>
                <Field.Label>Preset Name</Field.Label>
                <Input.Root size="md">
                  <Input.Field
                    ref={field}
                    value={name}
                    disabled={busy}
                    onValueChange={(value) => {
                      setName(value);
                      if (value.trim()) setInvalid(false);
                    }}
                  />
                </Input.Root>
                {invalid ? (
                  <Field.Error match>Name the preset to save it.</Field.Error>
                ) : (
                  <Field.Description>
                    Reuse these settings the next time you export.
                  </Field.Description>
                )}
              </Field.Root>
              <Button type="submit" size="sm" loading={busy}>
                Save
              </Button>
            </form>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
