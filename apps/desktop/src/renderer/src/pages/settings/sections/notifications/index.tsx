import { Switch } from "@pond/ui";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

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
                Notify when a save finishes ingesting.
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
                Notify when yt-dlp finishes pulling a video.
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
              <Settings.ItemTitle>Refresh Failures</Settings.ItemTitle>
              <Settings.ItemDescription>
                Notify when refresh hits an auth wall or rate limit.
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
