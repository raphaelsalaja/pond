import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "../../../pool/prefs";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useToast,
} from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

interface AppInfo {
  version: string;
}

/**
 * Updates section. Wires the existing electron-updater plumbing to
 * `prefs.updates`. Channel switch flips the auto-updater channel
 * (stable / beta); auto-install toggles `autoDownload`.
 *
 * Dev builds short-circuit electron-updater entirely — the manual
 * "Check for updates" button surfaces that as a toast so the user
 * isn't left wondering why nothing happened.
 */
export function UpdatesSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("updates");
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.pond.appInfo().then((i) => setInfo(i as AppInfo));
  }, []);

  const apply = useCallback(async () => {
    await window.pond.query("updates.applyPrefs", {});
  }, []);

  const onPatch = useCallback(
    (delta: Partial<typeof prefs>) => {
      patch(delta);
      setTimeout(() => void apply(), 50);
    },
    [patch, apply],
  );

  async function checkNow() {
    setBusy(true);
    try {
      const r = (await window.pond.query("updates.checkNow", {})) as
        | { ok: true; version?: string }
        | { ok: false; reason: string };
      if (!r.ok) {
        toast.add({
          title: "Update check failed",
          description:
            r.reason === "dev_build"
              ? "Update checks are disabled in development builds."
              : r.reason,
          type: "warning",
        });
        return;
      }
      toast.add({
        title: r.version
          ? `Update available: ${r.version}`
          : "You're on the latest version",
        type: "success",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionStack>
      <SectionHeader
        title="Updates"
        description={
          info
            ? `You're running Pond ${info.version}.`
            : "Choose your update channel and check for new versions."
        }
      />

      <SettingsCard title="Update channel">
        <Row
          label="Channel"
          description="Stable ships every few weeks; beta gets fixes (and the occasional bug) sooner."
          control={
            <Select
              value={prefs.channel}
              onValueChange={(v) =>
                onPatch({ channel: v as "stable" | "beta" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stable">Stable</SelectItem>
                <SelectItem value="beta">Beta</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <Row
          label="Auto-install updates"
          description="Download updates as they appear and apply them on next launch. Off keeps the existing version until you click Check below."
          control={
            <Switch
              checked={prefs.autoInstall}
              onCheckedChange={(v) => onPatch({ autoInstall: v })}
            />
          }
        />
        <Row
          label="Check for updates"
          description="Asks the update server right now whether a newer build is available."
          control={
            <Button size="sm" onClick={checkNow} disabled={busy}>
              {busy ? "Checking…" : "Check now"}
            </Button>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
