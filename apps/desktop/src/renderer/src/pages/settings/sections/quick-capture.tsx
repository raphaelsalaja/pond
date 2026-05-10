import { Switch } from "@pond/ui";
import { useCallback, useState } from "react";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

/**
 * Quick capture controls. Each switch flips a flag in
 * `prefs.quickCapture`; after every patch we ping
 * `quickCapture.applyPrefs` so main re-binds the tray icon and login
 * item without needing a restart.
 */
export function QuickCaptureSection() {
  const [prefs, patch] = usePrefs("quickCapture");
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

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Quick Capture</Settings.Title>
        <Settings.Description>
          Pin Pond to your menu bar and choose how it launches.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Menu Bar</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Show Menu-Bar Icon</Settings.ItemTitle>
              <Settings.ItemDescription>
                Keep Pond reachable from the system tray with the window hidden.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.menuBarIcon}
                onCheckedChange={(v) => void onPatch({ menuBarIcon: v })}
                disabled={busyApply}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Launch at Login</Settings.ItemTitle>
              <Settings.ItemDescription>
                Start Pond when you sign in to your computer.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.launchAtLogin}
                onCheckedChange={(v) => void onPatch({ launchAtLogin: v })}
                disabled={busyApply}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
