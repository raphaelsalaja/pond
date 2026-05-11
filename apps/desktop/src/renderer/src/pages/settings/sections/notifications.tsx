import { Switch } from "@pond/ui";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

/**
 * Notifications section. Each switch flips a flag the producers read
 * before firing — `saveComplete` gates both the in-app toast in
 * `effects/save-complete-toast.tsx` and the OS-level notification in
 * `main/core/notifications.ts`. The other toggles are wired at their
 * respective producer sites.
 */
export function NotificationsSection() {
  const [prefs, patch] = usePrefs("notifications");

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Notifications</Settings.Title>
        <Settings.Description>
          Choose which background events surface as a toast.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Channels</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Save Completed</Settings.ItemTitle>
              <Settings.ItemDescription>
                Notifies you when a save finishes ingesting from the extension
                or quick capture.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.saveComplete}
                onCheckedChange={(v) => patch({ saveComplete: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Video Download Finished</Settings.ItemTitle>
              <Settings.ItemDescription>
                Notifies you when yt-dlp finishes pulling a video.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.videoDone}
                onCheckedChange={(v) => patch({ videoDone: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>AI Suggestion Ready</Settings.ItemTitle>
              <Settings.ItemDescription>
                Notifies you when the enrichment worker drops a suggestion into
                the inbox.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.aiSuggestion}
                onCheckedChange={(v) => patch({ aiSuggestion: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Refresh Failures</Settings.ItemTitle>
              <Settings.ItemDescription>
                Notifies you when metadata refresh hits an auth wall or rate
                limit.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.refreshFailed}
                onCheckedChange={(v) => patch({ refreshFailed: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Sound</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Chime on Toast</Settings.ItemTitle>
              <Settings.ItemDescription>
                {"Plays a short 880\u00A0Hz tick when a toast lands."}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.sound}
                onCheckedChange={(v) => patch({ sound: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
