import { useState } from "react";
import { reloadPrefs } from "../../../pool/prefs";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  useToast,
} from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Destructive operations grouped under a single rail entry. Each
 * action either purges a sub-folder of the library (cheap to recover
 * from) or fully wipes settings + the SQLite index (recoverable from
 * `metadata.json` files on disk).
 *
 * Anything that touches user content shows an AlertDialog first.
 * Toggle-y actions (Clear preferences) skip it.
 */
export function ResetSection() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmFactory, setConfirmFactory] = useState(false);

  async function clearVideoCache() {
    setBusy("video");
    try {
      const r = (await window.pond.query("reset.clearVideoCache", {})) as {
        ok: boolean;
        removed: number;
      };
      toast.add({
        title: "Video cache cleared",
        description: `${r.removed} files removed`,
        type: "success",
      });
    } finally {
      setBusy(null);
    }
  }

  async function clearThumbnails() {
    setBusy("thumbs");
    try {
      const r = (await window.pond.query("reset.clearThumbnails", {})) as {
        ok: boolean;
        removed: number;
      };
      toast.add({
        title: "Thumbnails cleared",
        description: `${r.removed} files removed`,
        type: "success",
      });
    } finally {
      setBusy(null);
    }
  }

  async function resetPreferences() {
    setBusy("prefs");
    try {
      await window.pond.query("reset.preferences", {});
      await reloadPrefs();
      toast.add({ title: "Preferences reset to defaults", type: "success" });
    } finally {
      setBusy(null);
    }
  }

  async function factoryReset() {
    setBusy("factory");
    try {
      await window.pond.query("reset.factory", {});
      toast.add({
        title: "Pond will relaunch",
        description:
          "The SQLite index was wiped. Restart Pond to rebuild it from your library files.",
        type: "warning",
      });
    } finally {
      setBusy(null);
      setConfirmFactory(false);
    }
  }

  return (
    <SectionStack>
      <SectionHeader
        title="Reset"
        description="Destructive operations. Saves on disk are kept in every case — only caches and the SQLite index can disappear."
      />

      <SettingsCard title="Caches">
        <Row
          label="Clear video cache"
          description="Delete every downloaded MP4 in <library>/_video_cache/. Posters and metadata are kept; videos can be re-downloaded."
          control={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void clearVideoCache()}
              disabled={busy === "video"}
            >
              {busy === "video" ? "Clearing…" : "Clear cache"}
            </Button>
          }
        />
        <Row
          label="Clear thumbnails"
          description="Delete every cached preview tile under <library>/_thumbs/."
          control={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void clearThumbnails()}
              disabled={busy === "thumbs"}
            >
              {busy === "thumbs" ? "Clearing…" : "Clear thumbnails"}
            </Button>
          }
        />
      </SettingsCard>

      <SettingsCard title="Preferences">
        <Row
          label="Reset preferences"
          description="Restore every Settings page knob to its default. Your saves, tags, and AI provider config stay put."
          control={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void resetPreferences()}
              disabled={busy === "prefs"}
            >
              {busy === "prefs" ? "Resetting…" : "Reset"}
            </Button>
          }
        />
      </SettingsCard>

      <SettingsCard title="Danger zone">
        <Row
          label="Factory reset"
          description="Drops the SQLite index and the prefs blob; the metadata.json files on disk are kept. Pond will rebuild the index on next launch."
          control={
            <AlertDialog open={confirmFactory} onOpenChange={setConfirmFactory}>
              <AlertDialogTrigger
                render={<Button variant="danger">Factory reset…</Button>}
              />
              <AlertDialogContent>
                <AlertDialogTitle>Factory reset?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your saves on disk are kept; only the SQLite index and your
                  preferences are wiped. You'll re-run onboarding on next
                  launch.
                </AlertDialogDescription>
                <AlertDialogActions>
                  <AlertDialogClose
                    render={<Button variant="ghost">Cancel</Button>}
                  />
                  <AlertDialogClose
                    render={
                      <Button
                        variant="danger"
                        disabled={busy === "factory"}
                        onClick={(e) => {
                          e.preventDefault();
                          void factoryReset();
                        }}
                      >
                        {busy === "factory" ? "Resetting…" : "Wipe and restart"}
                      </Button>
                    }
                  />
                </AlertDialogActions>
              </AlertDialogContent>
            </AlertDialog>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
