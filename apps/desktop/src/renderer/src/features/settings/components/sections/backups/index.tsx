import { Button, Settings } from "@pond/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { TransferJobsPanel } from "@/features/downloads/transfers";
import { prettyPath } from "@/shared/lib/pretty-path";
import { playUiSuccess } from "@/shared/lib/sounds";
import styles from "./styles.module.css";

const BackupResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), path: z.string(), copied: z.number() }),
  z.object({
    ok: z.literal(false),
    reason: z.string().optional(),
    error: z.string().optional(),
  }),
]);

const FIRST_BACKUP_KEY = "pond.first-library-backup";

function backupError(failure: { reason?: string; error?: string }): string {
  switch (failure.reason) {
    case "cancelled":
      return "";
    case "same_path":
      return "Pick a different location than the open library.";
    case "nested_path":
      return "Can't back up into a folder inside the library.";
    case "destination_exists":
      return "That folder already has files. Pick a new name.";
    case "no_library":
      return "No library is open to back up.";
    default:
      return failure.error ?? "Couldn't back up the library. Try again.";
  }
}

export function BackupSettings() {
  const client = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const backup = useMutation({
    mutationFn: async () => {
      setNote(null);
      setCelebrate(false);
      const result = BackupResultSchema.parse(
        await window.pond.query("library.backupTo", {}),
      );
      if (!result.ok) {
        const message = backupError(result);
        if (message) throw new Error(message);
        return;
      }
      return result;
    },
    onSuccess: (result) => {
      if (!result) return;
      void client.invalidateQueries({ queryKey: ["storage-backup"] });
      const first =
        "localStorage" in globalThis &&
        localStorage.getItem(FIRST_BACKUP_KEY) !== "1";
      if (first) {
        localStorage.setItem(FIRST_BACKUP_KEY, "1");
        setCelebrate(true);
        playUiSuccess();
      }
      setNote(`Backup saved to ${prettyPath(result.path)}`);
    },
  });

  const restore = useMutation({
    mutationFn: async () => {
      setNote(null);
      setCelebrate(false);
      const result = BackupResultSchema.parse(
        await window.pond.query("library.restoreBackup", {}),
      );
      if (!result.ok && result.reason !== "cancelled") {
        throw new Error(
          result.error ?? "Couldn't restore the backup. Try again.",
        );
      }
    },
  });

  return (
    <>
      <Settings.List>
        <Settings.Item id="setting-backups-backup">
          <Settings.ItemDetails>
            <Settings.ItemTitle>Back Up Library</Settings.ItemTitle>
            <Settings.ItemDescription>
              Copy the pond elsewhere. This library stays open.
              <StatusNote
                error={backup.error?.message}
                status={note}
                celebrate={celebrate}
              />
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Button
              size="sm"
              variant="secondary"
              disabled={backup.isPending}
              loading={backup.isPending}
              onClick={() => backup.mutate()}
            >
              Backup
            </Button>
          </Settings.ItemControl>
        </Settings.Item>
        <Settings.Item id="setting-backups-restore">
          <Settings.ItemDetails>
            <Settings.ItemTitle>Restore Backup</Settings.ItemTitle>
            <Settings.ItemDescription>
              Verify a backup and open a restored copy.
              <StatusNote error={restore.error?.message} />
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Button
              size="sm"
              variant="secondary"
              disabled={restore.isPending}
              loading={restore.isPending}
              onClick={() => restore.mutate()}
            >
              Restore
            </Button>
          </Settings.ItemControl>
        </Settings.Item>
      </Settings.List>
      <TransferJobsPanel />
    </>
  );
}

function StatusNote({
  error,
  status,
  celebrate,
}: {
  error?: string | null;
  status?: string | null;
  celebrate?: boolean;
}) {
  const message = error || status;
  if (!message) return null;
  return (
    <span
      className={styles.message}
      data-error={error ? true : undefined}
      data-celebrate={!error && celebrate ? true : undefined}
      role={error ? "alert" : "status"}
    >
      {message}
    </span>
  );
}
