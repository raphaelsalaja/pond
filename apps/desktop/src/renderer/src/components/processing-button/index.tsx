import { Dialog } from "@pond/ui";
import { useCallback, useMemo, useState } from "react";
import { ProcessingDialog } from "@/components/processing-dialog";
import { useSaves } from "@/pool/hooks";
import styles from "./styles.module.css";

/* The grid only renders complete saves; everything still in-flight or
 * failed is surfaced behind this trigger and the ProcessingDialog. We
 * watch the pool directly for the count so the button appears the
 * instant a sync seeds new ingesting rows. */
function Root() {
  const saves = useSaves();
  const counts = useMemo(() => {
    let ingesting = 0;
    let failed = 0;
    for (const s of saves) {
      if (s.deletedAt) continue;
      if (s.status === "ingesting") ingesting += 1;
      else if (s.status === "failed") failed += 1;
    }
    return { ingesting, failed, total: ingesting + failed };
  }, [saves]);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  if (counts.total === 0) return null;

  const label = describe(counts.ingesting, counts.failed);
  const ariaLabel = `Open processing queue: ${label}`;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className={styles.row}>
        <Dialog.Trigger
          type="button"
          className={styles.button}
          data-has-failed={counts.failed > 0 ? "true" : undefined}
          aria-label={ariaLabel}
        >
          {counts.ingesting > 0 ? (
            <span className={styles.pulse} aria-hidden />
          ) : (
            <span className={styles["alert-dot"]} aria-hidden />
          )}
          <span className={styles.label}>{label}</span>
        </Dialog.Trigger>
      </div>
      <ProcessingDialog.Content
        open={open}
        ingestingCount={counts.ingesting}
        failedCount={counts.failed}
        onClose={close}
      />
    </Dialog.Root>
  );
}

function describe(ingesting: number, failed: number): string {
  const parts: string[] = [];
  if (ingesting > 0) parts.push(`${ingesting} processing`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" · ");
}

export const ProcessingButton = { Root };
