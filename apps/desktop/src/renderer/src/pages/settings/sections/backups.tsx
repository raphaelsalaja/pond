import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "../../../pool/prefs";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from "../../../ui";
import {
  Row,
  SectionHeader,
  SectionStack,
  SettingsCard,
  StackedRow,
} from "./_shared";

interface Snapshot {
  path: string;
  filename: string;
  size: number;
  createdAt: number;
}

/**
 * Local snapshot backups. The cron in
 * `apps/desktop/src/main/core/backups.ts` reads `prefs.backups`
 * once an hour and writes a fresh zip when the schedule says so.
 *
 * The default is `never` because a weekly zip of a 5GB library
 * fills disk fast — users who want backups have to opt in
 * explicitly.
 */
export function BackupsSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("backups");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const r = (await window.pond.query("backups.list", {})) as {
      ok: boolean;
      snapshots: Snapshot[];
    };
    if (r.ok) setSnapshots(r.snapshots);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function snapshotNow() {
    setBusy(true);
    try {
      await window.pond.query("backups.snapshotNow", {});
      toast.add({ title: "Snapshot created", type: "success" });
      await refresh();
    } catch (err) {
      toast.add({
        title: "Snapshot failed",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function reveal(filename: string) {
    await window.pond.query("backups.reveal", { filename });
  }

  async function deleteSnapshot(filename: string) {
    await window.pond.query("backups.delete", { filename });
    await refresh();
  }

  return (
    <SectionStack>
      <SectionHeader
        title="Backups"
        description="Periodic local snapshots of your library. Default is off — zips can balloon disk usage fast."
      />

      <SettingsCard title="Schedule">
        <Row
          label="Snapshot frequency"
          description="The cron runs once an hour and fires a snapshot when this much time has passed since the last one."
          control={
            <Select
              value={prefs.schedule}
              onValueChange={(v) =>
                patch({
                  schedule: v as "never" | "daily" | "weekly" | "monthly",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <Row
          label="Retain"
          description="How many snapshot zips to keep before pruning the oldest."
          control={
            <Input
              size="sm"
              type="number"
              value={String(prefs.retainCount)}
              onChange={(e) =>
                patch({
                  retainCount: Math.max(
                    1,
                    Math.min(50, Number(e.target.value) || 4),
                  ),
                })
              }
              style={{ width: 96 }}
            />
          }
        />
      </SettingsCard>

      <SettingsCard title="Manual">
        <Row
          label="Snapshot now"
          description="Write a one-off zip of the library into _snapshots/ outside the schedule."
          control={
            <Button size="sm" onClick={snapshotNow} disabled={busy}>
              {busy ? "Zipping…" : "Snapshot now"}
            </Button>
          }
        />
      </SettingsCard>

      <SettingsCard title="Existing snapshots">
        {snapshots.length === 0 ? (
          <StackedRow
            label="No snapshots yet"
            description="They'll appear here once the cron fires or you create one manually."
          >
            <span />
          </StackedRow>
        ) : (
          snapshots.map((s) => (
            <Row
              key={s.filename}
              label={s.filename}
              description={`${formatBytes(s.size)} · ${new Date(s.createdAt).toLocaleString()}`}
              control={
                <div style={{ display: "flex", gap: 6 }}>
                  <Button size="sm" onClick={() => void reveal(s.filename)}>
                    Reveal
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void deleteSnapshot(s.filename)}
                  >
                    Delete
                  </Button>
                </div>
              }
            />
          ))
        )}
      </SettingsCard>
    </SectionStack>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
