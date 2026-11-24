import { Button, Dialog, Field, Input } from "@pond/ui";
import { useRef, useState } from "react";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { importLinks } from "../actions";
import styles from "./styles.module.css";

export function SaveDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    if (submitting.current) {
      return;
    }
    if (!text.trim()) {
      setError("Add at least one link.");
      field.current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const failed = await importLinks(text);
      if (failed.length > 0) {
        setText(failed.join("\n"));
        setError(
          `Couldn't import ${formatPlural(failed.length, { one: "link", other: "links" })}. Retry the remaining links.`,
        );
        return;
      }
      onClose();
    } catch (error_) {
      setError(errorCopy(error_, "Couldn't save. Try again."));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open) => {
        if (!open && !submitting.current) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <Dialog.Header>
              <Dialog.Title>Import from Links</Dialog.Title>
            </Dialog.Header>
            <Dialog.Content className={styles.content}>
              <Dialog.Description>
                Add website links, one per line.
              </Dialog.Description>
              <Field.Root>
                <Field.Label>Links</Field.Label>
                <Input.Root size="md" className={styles.control}>
                  <Field.Control
                    render={<Input.Textarea ref={field} />}
                    value={text}
                    onValueChange={(value) => {
                      setText(value);
                      setError(null);
                    }}
                    disabled={busy}
                    autoFocus
                    aria-invalid={!!error}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.metaKey || event.ctrlKey)
                      ) {
                        event.preventDefault();
                        void submit();
                      }
                    }}
                  />
                </Input.Root>
              </Field.Root>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
            </Dialog.Content>
            <Dialog.Footer>
              <Dialog.Cancel disabled={busy} />
              <Button type="submit" loading={busy}>
                Import
              </Button>
            </Dialog.Footer>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
