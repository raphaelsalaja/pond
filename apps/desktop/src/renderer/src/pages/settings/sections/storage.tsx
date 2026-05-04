import { useEffect, useState } from "react";
import { Button, useToast } from "../../../ui";
import styles from "../styles.module.css";
import {
  Row,
  SectionHeader,
  SectionStack,
  SettingsCard,
  StackedRow,
} from "./_shared";
import { DEFAULT_VIDEO_DOWNLOAD, type SettingsRow } from "./_types";

interface IntegrityReport {
  orphans: string[];
  missing: string[];
  errors: Record<string, string>;
  totalIndexed: number;
  totalOnDisk: number;
}

/**
 * Library storage. Ships the full action surface for the on-disk
 * library — open in Finder, rescan, move to a new location, run an
 * integrity check, and trigger an export.
 */
export function StorageSection() {
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<IntegrityReport | null>(null);

  useEffect(() => {
    void window.pond.query("settings.get", {}).then((s) => {
      const row = s as SettingsRow;
      setSettings({
        ...row,
        videoDownload: row.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD,
      });
    });
  }, []);

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function rescan() {
    await withBusy("rescan", async () => {
      const res = (await window.pond.query("library.rescan", {})) as {
        updated: number;
        total: number;
      };
      toast.add({
        title: "Library rescanned",
        description: `${res.total} items (${res.updated} updated).`,
        type: "success",
      });
    });
  }

  async function openInFinder() {
    await window.pond.query("library.openInFinder", {});
  }

  async function move() {
    await withBusy("move", async () => {
      const res = (await window.pond.query("library.move", {})) as
        | { ok: true; path: string }
        | { ok: false; reason: string };
      if (!res.ok) {
        if (res.reason !== "cancelled") {
          toast.add({
            title: "Move failed",
            description: res.reason,
            type: "error",
          });
        }
        return;
      }
      toast.add({
        title: "Library copied",
        description: "Restart Pond to use the new location.",
        type: "success",
      });
    });
  }

  async function verify() {
    await withBusy("verify", async () => {
      const res = (await window.pond.query("library.verifyIntegrity", {})) as
        | (IntegrityReport & { ok: true })
        | { ok: false; reason: string };
      if (!res.ok) {
        toast.add({
          title: "Verification failed",
          description: res.reason,
          type: "error",
        });
        return;
      }
      setReport({
        orphans: res.orphans,
        missing: res.missing,
        errors: res.errors,
        totalIndexed: res.totalIndexed,
        totalOnDisk: res.totalOnDisk,
      });
      const drift = res.orphans.length + res.missing.length;
      toast.add({
        title: drift === 0 ? "Library is clean" : "Drift detected",
        description:
          drift === 0
            ? `${res.totalIndexed} items match on disk and in the index.`
            : `${res.orphans.length} on disk only · ${res.missing.length} indexed only.`,
        type: drift === 0 ? "success" : "warning",
      });
    });
  }

  async function exportZip() {
    await withBusy("export-zip", async () => {
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
    });
  }

  async function exportJson() {
    await withBusy("export-json", async () => {
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
    });
  }

  return (
    <SectionStack>
      <SectionHeader
        title="Storage"
        description="Where your saves live on disk and how Pond manages them."
      />

      <SettingsCard title="Library location">
        <StackedRow
          label="Source of truth"
          description={
            <code>{settings?.libraryRoot ?? "~/Pond/My Pond.library/"}</code>
          }
        >
          <div className={styles.inlineRow}>
            <Button size="sm" onClick={() => void openInFinder()}>
              Open in Finder
            </Button>
            <Button
              size="sm"
              disabled={busy === "rescan"}
              onClick={() => void rescan()}
            >
              Rescan library
            </Button>
            <Button
              size="sm"
              disabled={busy === "move"}
              onClick={() => void move()}
            >
              Move library…
            </Button>
          </div>
        </StackedRow>
      </SettingsCard>

      <SettingsCard title="Integrity">
        <Row
          label="Verify integrity"
          description={
            report
              ? `Last run: ${report.totalIndexed} indexed, ${report.totalOnDisk} on disk · ${report.orphans.length} orphan, ${report.missing.length} missing`
              : "Compare metadata.json files on disk against the SQLite index."
          }
          control={
            <Button
              size="sm"
              disabled={busy === "verify"}
              onClick={() => void verify()}
            >
              {busy === "verify" ? "Checking…" : "Run check"}
            </Button>
          }
        />
      </SettingsCard>

      <SettingsCard title="Export">
        <Row
          label="Library zip"
          description="One archive containing every items/<id>.info folder plus the library metadata."
          control={
            <Button
              size="sm"
              disabled={busy === "export-zip"}
              onClick={() => void exportZip()}
            >
              {busy === "export-zip" ? "Zipping…" : "Export as zip"}
            </Button>
          }
        />
        <Row
          label="Metadata as JSON"
          description="Plain JSON files for easy migration to other tools — one file per save plus a manifest."
          control={
            <Button
              size="sm"
              disabled={busy === "export-json"}
              onClick={() => void exportJson()}
            >
              {busy === "export-json" ? "Writing…" : "Export as JSON"}
            </Button>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
