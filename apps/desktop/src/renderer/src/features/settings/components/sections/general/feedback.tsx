import { Button, Settings, Switch } from "@pond/ui";
import { useEffect, useState } from "react";
import { IS_MAC } from "@/shared/lib/platform";
import { usePrefs } from "@/shared/state/prefs";

const SOUND_ROWS = [
  ["interface", "Interface", "Clicks, toggles, and confirmations."],
  ["saveDeletion", "Save Deletion", "Moving or deleting Saves."],
  ["folderDeletion", "Folder Deletion", "Removing folders."],
] as const;

const NOTIFICATION_ROWS = [
  ["saveDeletion", "Save Deletion", "Show after Saves are moved or deleted."],
  ["folderDeletion", "Folder Deletion", "Show after a folder is removed."],
  [
    "extensionCapture",
    "Extension Capture",
    "Show after an extension capture completes.",
  ],
  ["autoImport", "Auto Import", "Show after a watched file is imported."],
] as const;

function permissionStatus(): NotificationPermission | "unsupported" {
  return "Notification" in globalThis
    ? globalThis.Notification.permission
    : "unsupported";
}

export function SoundPreferences() {
  const [preferences, patchPreferences, preferencesLoaded] =
    usePrefs("preferences");
  const [feedback, patchFeedback, feedbackLoaded] = usePrefs("feedback");

  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Interface Sounds</Settings.ItemTitle>
          <Settings.ItemDescription>
            Control all sound feedback in Pond.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Switch.Root
            aria-label="Interface Sounds"
            checked={preferences.soundsEnabled}
            disabled={!preferencesLoaded}
            onCheckedChange={(soundsEnabled) =>
              void patchPreferences({ soundsEnabled })
            }
          />
        </Settings.ItemControl>
      </Settings.Item>
      {SOUND_ROWS.map(([key, title, description]) => (
        <Settings.Item key={key}>
          <Settings.ItemDetails>
            <Settings.ItemTitle>{title}</Settings.ItemTitle>
            <Settings.ItemDescription>{description}</Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Switch.Root
              aria-label={`${title} Sounds`}
              checked={feedback.sounds[key]}
              disabled={!feedbackLoaded || !preferences.soundsEnabled}
              onCheckedChange={(enabled) =>
                void patchFeedback({
                  sounds: { ...feedback.sounds, [key]: enabled },
                })
              }
            />
          </Settings.ItemControl>
        </Settings.Item>
      ))}
    </Settings.List>
  );
}

export function NotificationPreferences() {
  const [feedback, patch, loaded] = usePrefs("feedback");
  const [permission, setPermission] = useState(permissionStatus);

  useEffect(() => {
    const refresh = () => setPermission(permissionStatus());
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>System Permission</Settings.ItemTitle>
          <Settings.ItemDescription>
            {permission === "granted"
              ? "Notifications are allowed."
              : permission === "denied"
                ? IS_MAC
                  ? "Notifications are blocked in System Settings."
                  : "Notifications are blocked in Windows Settings."
                : permission === "unsupported"
                  ? "Notifications aren't available on this platform."
                  : "Allow Pond to show system notifications."}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        {permission === "default" || permission === "denied" ? (
          <Settings.ItemControl>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (permission === "default") {
                  void globalThis.Notification.requestPermission().then(
                    setPermission,
                  );
                  return;
                }
                void window.pond.query("notifications.openSettings", {});
              }}
            >
              {permission === "default"
                ? "Allow Notifications"
                : IS_MAC
                  ? "Open System Settings"
                  : "Open Settings"}
            </Button>
          </Settings.ItemControl>
        ) : null}
      </Settings.Item>
      {NOTIFICATION_ROWS.map(([key, title, description]) => (
        <Settings.Item key={key}>
          <Settings.ItemDetails>
            <Settings.ItemTitle>{title}</Settings.ItemTitle>
            <Settings.ItemDescription>{description}</Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Switch.Root
              aria-label={`${title} Notifications`}
              checked={feedback.notifications[key]}
              disabled={!loaded || permission !== "granted"}
              onCheckedChange={(enabled) =>
                void patch({
                  notifications: {
                    ...feedback.notifications,
                    [key]: enabled,
                  },
                })
              }
            />
          </Settings.ItemControl>
        </Settings.Item>
      ))}
    </Settings.List>
  );
}
