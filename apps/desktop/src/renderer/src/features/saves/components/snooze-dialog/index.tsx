import { Button, DatePicker, Dialog, Field, Input } from "@pond/ui";
import { useState } from "react";
import { snoozeSaves } from "@/features/saves/lib/inbox-actions";
import { snoozeOptions, snoozeUntil } from "@/features/saves/lib/snooze";
import {
  closeSnoozeDialog,
  useSnoozeDialog,
} from "@/features/saves/state/snooze-dialog";
import { useRetainedDialogPayload } from "@/shared/hooks/use-retained-dialog-payload";
import styles from "./styles.module.css";

function localDay(time: number): string {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Tomorrow at 9:00 is always ahead, while a Later Today day paired with the 9:00 default may have passed. */
function defaultDay(): string {
  const tomorrow = snoozeOptions().find((option) => option.id === "tomorrow");
  return localDay(tomorrow?.until ?? Date.now());
}

export function SnoozeDialogHost() {
  const state = useSnoozeDialog();
  const presentation = useRetainedDialogPayload(state);
  return presentation.payload ? (
    <SnoozeDialog
      key={presentation.payload.id}
      open={presentation.open}
      saveIds={presentation.payload.saveIds}
    />
  ) : null;
}

function SnoozeDialog({
  open,
  saveIds,
}: {
  open: boolean;
  saveIds: readonly string[];
}) {
  const [day, setDay] = useState(defaultDay);
  const [time, setTime] = useState("09:00");
  const [presets] = useState(() => snoozeOptions());
  const until = snoozeUntil(day, time);

  function snooze(at: number) {
    closeSnoozeDialog();
    void snoozeSaves(saveIds, at);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSnoozeDialog();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>Snooze Until</Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <Dialog.Content>
            <Dialog.Description>
              Snoozed saves leave the Inbox and come back for review at the time
              you pick.
            </Dialog.Description>
            <div className={styles.presets}>
              {presets.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => snooze(option.until)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className={styles.fields}>
              <Field.Root>
                <Field.Label>Date</Field.Label>
                <DatePicker
                  value={day}
                  min={localDay(Date.now())}
                  onValueChange={setDay}
                  aria-label="Date"
                />
              </Field.Root>
              <Field.Root invalid={until === null || undefined}>
                <Field.Label>Time</Field.Label>
                <Input.Root size="sm">
                  <Input.Field
                    type="time"
                    value={time}
                    onValueChange={setTime}
                  />
                </Input.Root>
              </Field.Root>
            </div>
            {until === null ? (
              <p className={styles.error} role="alert">
                That time has passed. Pick a later one.
              </p>
            ) : null}
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel>Cancel</Dialog.Cancel>
            <Dialog.Confirm
              disabled={until === null}
              onClick={() => {
                if (until !== null) snooze(until);
              }}
            >
              Snooze
            </Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
