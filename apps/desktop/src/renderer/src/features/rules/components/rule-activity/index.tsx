import { Dialog } from "@pond/ui";
import type { Rule, RuleRunEntry } from "@shared/rule-contracts";
import { useLayoutEffect, useState } from "react";
import { openSave } from "@/features/saves/navigation";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import { describeChange, joinList } from "../../lib/summary";
import type { RuleNames } from "../../lib/summary";
import { useRuleActivity } from "../../state/rules";
import styles from "./styles.module.css";

const TRIGGER_LABELS = new Map([
  ["newSave", "New Save"],
  ["addedToFolder", "Added to Folder"],
  ["apply", "Applied to Existing"],
]);

function outcomeText(run: RuleRunEntry, names: RuleNames): string {
  if (run.outcome === "failed") return run.error ?? "Failed";
  if (run.outcome === "unchanged") {
    return run.error ?? "Matched; already organized";
  }
  return joinList(run.changes.map((change) => describeChange(change, names)));
}

export function RuleActivity({
  rule,
  names,
  onClose,
}: {
  rule: Rule;
  names: RuleNames;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { runs, loaded } = useRuleActivity(rule.id);
  useLayoutEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- The dialog mounts closed and opens before paint so its enter transition runs.
    setOpen(true);
  }, []);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>{rule.name} Activity</Dialog.Title>
          </Dialog.Header>
          <div className={styles.body} data-scroll-fade="vertical">
            {loaded && !runs.length ? (
              <p className={styles.empty}>
                This Rule hasn’t matched a Save yet.
              </p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Trigger</th>
                    <th scope="col">Save</th>
                    <th scope="col">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id} data-outcome={run.outcome}>
                      <td>{relativeTimeFromMs(run.at)}</td>
                      <td>{TRIGGER_LABELS.get(run.trigger) ?? run.trigger}</td>
                      <td>
                        {run.saveId ? (
                          <button
                            type="button"
                            className={styles.link}
                            onClick={() => {
                              if (run.saveId) openSave(run.saveId);
                            }}
                          >
                            Open
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{outcomeText(run, names)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
