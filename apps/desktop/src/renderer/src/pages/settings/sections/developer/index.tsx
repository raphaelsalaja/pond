import { AlertDialog, Button, Switch, useToast } from "@pond/ui";
import { useCallback, useState } from "react";
import { Settings } from "@/components/settings";
import { reloadPrefs, usePrefs } from "@/pool/prefs";

export function DeveloperSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("developer");
  const [resetBusy, setResetBusy] = useState<string | null>(null);
  const [confirmFactory, setConfirmFactory] = useState(false);

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

  async function clearVideoCache() {
    setResetBusy("video");
    try {
      const r = (await window.pond.query("reset.clearVideoCache", {})) as {
        ok: boolean;
        removed: number;
      };
      toast.add({
        title: "Video cache cleared",
        description: `${r.removed}\u00A0files removed.`,
        type: "success",
      });
    } finally {
      setResetBusy(null);
    }
  }

  async function clearThumbnails() {
    setResetBusy("thumbs");
    try {
      const r = (await window.pond.query("reset.clearThumbnails", {})) as {
        ok: boolean;
        removed: number;
      };
      toast.add({
        title: "Thumbnails cleared",
        description: `${r.removed}\u00A0files removed.`,
        type: "success",
      });
    } finally {
      setResetBusy(null);
    }
  }

  async function resetPreferences() {
    setResetBusy("prefs");
    try {
      await window.pond.query("reset.preferences", {});
      await reloadPrefs();
      toast.add({ title: "Preferences reset to defaults", type: "success" });
    } finally {
      setResetBusy(null);
    }
  }

  async function factoryReset() {
    setResetBusy("factory");
    try {
      await window.pond.query("reset.factory", {});
      toast.add({
        title: "Pond will relaunch",
        description:
          "Index wiped. Restart Pond to rebuild from your library files.",
        type: "warning",
      });
    } finally {
      setResetBusy(null);
      setConfirmFactory(false);
    }
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Developer</Settings.Title>
        <Settings.Description>
          Logs, inspector, cache resets, and the factory wipe.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Diagnostics</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Open Log Directory</Settings.ItemTitle>
              <Settings.ItemDescription>
                Reveal electron-log files in your file manager.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={() => void openLogs()}>
                Reveal
              </Button>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Verbose Logging</Settings.ItemTitle>
              <Settings.ItemDescription>
                Capture every IPC and executor call. Slows Pond down.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.verboseLogging}
                onCheckedChange={(v) => void apply(v)}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Open IPC Inspector</Settings.ItemTitle>
              <Settings.ItemDescription>
                Read-only view of recent IPC traffic.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button size="sm" onClick={() => void openInspector()}>
                Open Inspector
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Caches</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Clear Video Cache</Settings.ItemTitle>
              <Settings.ItemDescription>
                Delete every cached MP4 under <code>_video_cache/</code>.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void clearVideoCache()}
                disabled={resetBusy === "video"}
              >
                {resetBusy === "video" ? "Clearing…" : "Clear Cache"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Clear Thumbnails</Settings.ItemTitle>
              <Settings.ItemDescription>
                Delete every cached preview tile under <code>_thumbs/</code>.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void clearThumbnails()}
                disabled={resetBusy === "thumbs"}
              >
                {resetBusy === "thumbs" ? "Clearing…" : "Clear Thumbnails"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Reset Preferences</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Reset Preferences</Settings.ItemTitle>
              <Settings.ItemDescription>
                Restore every Settings knob to its default.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void resetPreferences()}
                disabled={resetBusy === "prefs"}
              >
                {resetBusy === "prefs" ? "Resetting…" : "Reset"}
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Danger Zone</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Factory Reset</Settings.ItemTitle>
              <Settings.ItemDescription>
                Drop the SQLite index. Rebuilds from metadata on next launch.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <AlertDialog.Root
                open={confirmFactory}
                onOpenChange={setConfirmFactory}
              >
                <AlertDialog.Trigger
                  render={<Button variant="danger">Factory Reset…</Button>}
                />
                <AlertDialog.Content>
                  <AlertDialog.Title>Factory Reset?</AlertDialog.Title>
                  <AlertDialog.Description>
                    This wipes the SQLite index and prefs. Saves on disk stay
                    put. You'll see onboarding on next launch.
                  </AlertDialog.Description>
                  <AlertDialog.Actions>
                    <AlertDialog.Close
                      render={<Button variant="ghost">Cancel</Button>}
                    />
                    <AlertDialog.Close
                      render={
                        <Button
                          variant="danger"
                          disabled={resetBusy === "factory"}
                          onClick={(e) => {
                            e.preventDefault();
                            void factoryReset();
                          }}
                        >
                          {resetBusy === "factory"
                            ? "Resetting…"
                            : "Wipe & Restart"}
                        </Button>
                      }
                    />
                  </AlertDialog.Actions>
                </AlertDialog.Content>
              </AlertDialog.Root>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
