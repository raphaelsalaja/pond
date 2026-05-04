import { usePrefs } from "../../../pool/prefs";
import { Switch } from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Notifications section. Each switch maps to a `category` tag the
 * shared `useToast()` wrapper checks before rendering — see
 * `apps/desktop/src/renderer/src/ui/toast.tsx`. Untagged toasts
 * (system errors, IPC failures) always show.
 */
export function NotificationsSection() {
  const [prefs, patch] = usePrefs("notifications");

  return (
    <SectionStack>
      <SectionHeader
        title="Notifications"
        description="Pick which background events surface as a toast and whether they make a sound."
      />

      <SettingsCard title="App notifications">
        <Row
          label="Save complete"
          description="When a card finishes ingesting from the extension or quick capture."
          control={
            <Switch
              checked={prefs.saveComplete}
              onCheckedChange={(v) => patch({ saveComplete: v })}
            />
          }
        />
        <Row
          label="Video download finished"
          description="When yt-dlp finishes pulling a video in the background."
          control={
            <Switch
              checked={prefs.videoDone}
              onCheckedChange={(v) => patch({ videoDone: v })}
            />
          }
        />
        <Row
          label="AI suggestion ready"
          description="When the enrichment worker drops a suggestion into the inbox."
          control={
            <Switch
              checked={prefs.aiSuggestion}
              onCheckedChange={(v) => patch({ aiSuggestion: v })}
            />
          }
        />
        <Row
          label="Refresh failures"
          description="When metadata refresh hits an auth wall or rate limit."
          control={
            <Switch
              checked={prefs.refreshFailed}
              onCheckedChange={(v) => patch({ refreshFailed: v })}
            />
          }
        />
      </SettingsCard>

      <SettingsCard title="Sound">
        <Row
          label="Play chime on toast"
          description="A short 880Hz tick when a toast lands. Off by default."
          control={
            <Switch
              checked={prefs.sound}
              onCheckedChange={(v) => patch({ sound: v })}
            />
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
