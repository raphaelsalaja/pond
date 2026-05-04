import { useCallback } from "react";
import { usePrefs } from "../../../pool/prefs";
import { Button, Switch, useToast } from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Developer surface. None of these are secret; they're just rarely
 * needed and so live behind the Advanced rail group.
 */
export function DeveloperSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("developer");

  const apply = useCallback(
    async (next: boolean) => {
      patch({ verboseLogging: next });
      await window.pond.query("developer.applyVerboseLogging", {
        verbose: next,
      });
    },
    [patch],
  );

  async function openLogs() {
    await window.pond.query("developer.openLogs", {});
  }

  async function openInspector() {
    const r = (await window.pond.query("developer.openIpcInspector", {})) as {
      ok: boolean;
      reason?: string;
    };
    if (!r.ok && r.reason) {
      toast.add({
        title: "Inspector failed",
        description: r.reason,
        type: "error",
      });
    }
  }

  return (
    <SectionStack>
      <SectionHeader
        title="Developer"
        description="Logs, IPC inspector, and other internals for poking around Pond."
      />

      <SettingsCard title="Diagnostics">
        <Row
          label="Open log directory"
          description="Reveal electron-log files in your file manager."
          control={
            <Button size="sm" onClick={() => void openLogs()}>
              Reveal
            </Button>
          }
        />
        <Row
          label="Verbose logging"
          description="Lower the log level so every IPC call + executor transaction is captured. Slows the app down."
          control={
            <Switch
              checked={prefs.verboseLogging}
              onCheckedChange={(v) => void apply(v)}
            />
          }
        />
        <Row
          label="Open IPC inspector"
          description="A read-only window listing recent IPC traffic. Currently a placeholder; the log file is the canonical transcript."
          control={
            <Button size="sm" onClick={() => void openInspector()}>
              Open inspector
            </Button>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
