import { IconChevronExpandYOutline12 } from "@pond/icons/outline/12";
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

export function BackupsSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("backups");
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);

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

  async function exportZip() {
    setExportBusy("zip");
    try {
      const res = (await window.pond.query("library.exportZip", {})) as
        | { ok: true; path: string }
        | { ok: false; reason: string };
      if (!res.ok) {
        if (res.reason !== "cancelled") {
          toast.add({
            title: "Export failed",
            description: res.reason,
            type: "error",
          });
        }
        return;
      }
      toast.add({
        title: "Export complete",
        description: res.path,
        type: "success",
      });
    } finally {
      setExportBusy(null);
    }
  }

  async function exportJson() {
    setExportBusy("json");
    try {
      const res = (await window.pond.query("library.exportJson", {})) as
        | { ok: true; path: string }
        | { ok: false; reason: string };
      if (!res.ok) {
        if (res.reason !== "cancelled") {
          toast.add({
            title: "Export failed",
            description: res.reason,
            type: "error",
          });
        }
        return;
      }
      toast.add({
        title: "JSON export complete",
        description: res.path,
        type: "success",
      });
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Backups & Export</Settings.Title>
        <Settings.Description>
          Schedule snapshots, write one-off zips, and export your data.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Schedule</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Snapshot Frequency</Settings.ItemTitle>
              <Settings.ItemDescription>
                How long Pond waits before the next snapshot.
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
                  <Select.Icon>
                    <IconChevronExpandYOutline12 />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner sideOffset={6}>
                    <Select.Popup>
                      <Select.Item value="never">Never</Select.Item>
                      <Select.Item value="daily">Daily</Select.Item>
                      <Select.Item value="weekly">Weekly</Select.Item>
                      <Select.Item value="monthly">Monthly</Select.Item>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
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
              <Input
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
                Write a one-off zip into <code>_snapshots/</code>.
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

      <Settings.Section>
        <Settings.SectionTitle>Export</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Library Zip</Settings.ItemTitle>
              <Settings.ItemDescription>
                Full archive of every save plus library metadata.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                disabled={exportBusy === "zip"}
                onClick={() => void exportZip()}
              >
                {exportBusy === "zip" ? "Zipping…" : "Export as Zip"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Metadata as JSON</Settings.ItemTitle>
              <Settings.ItemDescription>
                One JSON file per save plus a manifest.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                disabled={exportBusy === "json"}
                onClick={() => void exportJson()}
              >
                {exportBusy === "json" ? "Writing…" : "Export as JSON"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
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
