import { useCallback, useEffect, useState } from "react";
import { usePrefs } from "../../../pool/prefs";
import { Button, Switch, useToast } from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Quick capture controls. Each switch flips a flag in
 * `prefs.quickCapture`; after every patch we ping
 * `quickCapture.applyPrefs` so main re-binds the tray icon, login
 * item, and global hotkey without needing a restart.
 */
export function QuickCaptureSection() {
  const toast = useToast();
  const [prefs, patch] = usePrefs("quickCapture");
  const [recording, setRecording] = useState(false);
  const [busyApply, setBusyApply] = useState(false);

  const apply = useCallback(async () => {
    setBusyApply(true);
    try {
      await window.pond.query("quickCapture.applyPrefs", {});
    } finally {
      setBusyApply(false);
    }
  }, []);

  const onPatch = useCallback(
    async (delta: Partial<typeof prefs>) => {
      patch(delta);
      // Defer the re-apply so the optimistic prefs cache update runs
      // first; main will read the freshly-persisted blob.
      setTimeout(() => void apply(), 50);
    },
    [patch, apply],
  );

  // Attach the keydown listener to `window` while recording so the
  // capture works regardless of where focus is. Avoids putting an
  // interactive handler on a non-interactive `<div>` (a11y lint).
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const parts: string[] = [];
      if (e.metaKey)
        parts.push(process.platform === "darwin" ? "Command" : "Meta");
      if (e.ctrlKey) parts.push("Control");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      const key = e.key;
      // Treat modifier-only events as "still recording".
      if (["Meta", "Shift", "Control", "Alt"].includes(key)) return;
      const main = key.length === 1 ? key.toUpperCase() : key;
      parts.push(main);
      const accel = parts.join("+");

      void (async () => {
        const test = (await window.pond.query("quickCapture.testHotkey", {
          accelerator: accel,
        })) as { ok: boolean; reason?: string };
        if (!test.ok) {
          toast.add({
            title: "Hotkey rejected",
            description:
              "Try a different combination — that one couldn't be bound.",
            type: "error",
          });
          return;
        }
        setRecording(false);
        await onPatch({ hotkey: accel });
        toast.add({
          title: "Hotkey updated",
          description: accel,
          type: "success",
        });
      })();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [recording, onPatch, toast]);

  return (
    <SectionStack>
      <SectionHeader
        title="Quick capture"
        description="Pin Pond to your menu bar and bind a global hotkey for one-keypress saves."
      />

      <SettingsCard title="Menu bar">
        <Row
          label="Show menu-bar icon"
          description="Keep Pond accessible from the system tray even when the window is hidden."
          control={
            <Switch
              checked={prefs.menuBarIcon}
              onCheckedChange={(v) => void onPatch({ menuBarIcon: v })}
            />
          }
        />
        <Row
          label="Launch at login"
          description="Start Pond automatically when you sign in to your computer."
          control={
            <Switch
              checked={prefs.launchAtLogin}
              onCheckedChange={(v) => void onPatch({ launchAtLogin: v })}
            />
          }
        />
      </SettingsCard>

      <SettingsCard title="Global capture hotkey">
        <Row
          label="Capture hotkey"
          description="Pop the quick-save sheet from anywhere on your computer."
          control={
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <code
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontSize: 12,
                  background: "var(--pond-bg-subtle)",
                  border: "1px solid var(--pond-border)",
                  minWidth: 140,
                  textAlign: "center",
                  letterSpacing: 0.4,
                }}
              >
                {recording ? "Press a combination…" : prefs.hotkey || "Not set"}
              </code>
              <Button
                size="sm"
                disabled={busyApply}
                onClick={() => setRecording((v) => !v)}
              >
                {recording ? "Cancel" : "Record"}
              </Button>
            </div>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
