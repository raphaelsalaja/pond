import { Button, Input, Select, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

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
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Backups</Settings.Title>
        <Settings.Description>
          Schedule periodic zips of your library. Off by default.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Schedule</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Snapshot Frequency</Settings.ItemTitle>
              <Settings.ItemDescription>
                An hourly cron fires a snapshot once this much time has passed
                since the last one.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={prefs.schedule}
                onValueChange={(v) =>
                  patch({
                    schedule: v as "never" | "daily" | "weekly" | "monthly",
                  })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="never">Never</Select.Item>
                  <Select.Item value="daily">Daily</Select.Item>
                  <Select.Item value="weekly">Weekly</Select.Item>
                  <Select.Item value="monthly">Monthly</Select.Item>
                </Select.Content>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Retain</Settings.ItemTitle>
              <Settings.ItemDescription>
                How many snapshot zips to keep before pruning the oldest.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Input.Root
                data-size="sm"
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
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Manual</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Snapshot Now</Settings.ItemTitle>
              <Settings.ItemDescription>
                Write a one-off zip into <code>_snapshots/</code> outside the
                schedule.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={snapshotNow} disabled={busy}>
                {busy ? "Zipping…" : "Snapshot Now"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Existing Snapshots</Settings.SectionTitle>
        <Settings.List>
          {snapshots.length === 0 ? (
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>No Snapshots Yet</Settings.ItemTitle>
                <Settings.ItemDescription>
                  They appear here once the schedule fires or you create one.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
            </Settings.Item>
          ) : (
            snapshots.map((s) => (
              <Settings.Item key={s.filename}>
                <Settings.ItemDetails>
                  <Settings.ItemTitle>{s.filename}</Settings.ItemTitle>
                  <Settings.ItemDescription>
                    {`${formatBytes(s.size)} · ${new Date(s.createdAt).toLocaleString()}`}
                  </Settings.ItemDescription>
                </Settings.ItemDetails>
                <Settings.ItemControl>
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
                </Settings.ItemControl>
              </Settings.Item>
            ))
          )}
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}\u00A0B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}\u00A0KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}\u00A0MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}\u00A0GB`;
}
