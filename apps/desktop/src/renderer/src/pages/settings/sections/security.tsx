import { useEffect, useState } from "react";
import { usePrefs } from "../../../pool/prefs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * App-lock controls. Touch ID gate runs on launch + after auto-lock
 * via `<LockGate>` (mounted in `App.tsx`). The settings here just
 * persist the prefs; the gate reads them on mount.
 *
 * We probe `security.touchIdSupported` once on mount so the row is
 * hidden on Linux/Windows or Macs without the sensor — saves the user
 * the trouble of toggling a switch that does nothing.
 */
export function SecuritySection() {
  const [prefs, patch] = usePrefs("security");
  const [touchIdSupported, setTouchIdSupported] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    void window.pond
      .query("security.touchIdSupported", {})
      .then((r) => {
        const result = r as { supported?: boolean };
        setTouchIdSupported(Boolean(result?.supported));
      })
      .catch(() => setTouchIdSupported(false));
  }, []);

  const lockValue =
    prefs.autoLockMinutes === null ? "never" : String(prefs.autoLockMinutes);

  return (
    <SectionStack>
      <SectionHeader
        title="Security & access"
        description="Lock Pond behind your OS biometrics so an open laptop doesn't broadcast your library."
      />

      <SettingsCard title="App lock">
        {touchIdSupported ? (
          <Row
            label="Require Touch ID on launch"
            description="Authenticate every time the Pond window comes to focus from a cold start."
            control={
              <Switch
                checked={prefs.touchIdOnLaunch}
                onCheckedChange={(v) => patch({ touchIdOnLaunch: v })}
              />
            }
          />
        ) : touchIdSupported === false ? (
          <Row
            label="Touch ID"
            description="This Mac doesn't expose a Touch ID prompt to apps, or you're on Linux/Windows. Auto-lock below still works as a soft gate."
            control={<span style={{ opacity: 0.6 }}>Unavailable</span>}
          />
        ) : (
          <Row
            label="Touch ID"
            description="Probing your machine…"
            control={<span style={{ opacity: 0.6 }}>Checking</span>}
          />
        )}

        <Row
          label="Auto-lock"
          description="Lock the window after a period of inactivity. The lock screen requires Touch ID (if available) or a confirmation click."
          control={
            <Select
              value={lockValue}
              onValueChange={(v) =>
                patch({ autoLockMinutes: v === "never" ? null : Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="1">1 minute</SelectItem>
                <SelectItem value="5">5 minutes</SelectItem>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
