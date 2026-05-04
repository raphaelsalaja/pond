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
 * General preferences. Theme + cursor flips run through `usePrefs`
 * which writes to the `prefs.preferences` bucket on the settings
 * singleton. The actual theme application happens in
 * `<ThemeApplier>` (mounted from `App.tsx`) so the rest of the app
 * just reads the persisted token.
 */
export function PreferencesSection() {
  const [prefs, patch] = usePrefs("preferences");

  return (
    <SectionStack>
      <SectionHeader
        title="Preferences"
        description="General settings for how Pond looks and behaves."
      />

      <SettingsCard title="General">
        <Row
          label="Convert text emoticons into emojis"
          description="Strings like :) are converted to the matching emoji on save."
          control={
            <Switch
              checked={prefs.convertEmoticons}
              onCheckedChange={(v) => patch({ convertEmoticons: v })}
            />
          }
        />
      </SettingsCard>

      <SettingsCard title="Interface and theme">
        <Row
          label="Use pointer cursors"
          description="Hover any interactive element to get a hand cursor instead of the default text caret."
          control={
            <Switch
              checked={prefs.pointerCursors}
              onCheckedChange={(v) => patch({ pointerCursors: v })}
            />
          }
        />
        <Row
          label="Interface theme"
          description="System follows your OS scheme; light or dark force a fixed appearance."
          control={
            <Select
              value={prefs.theme}
              onValueChange={(v) =>
                patch({ theme: v as "system" | "light" | "dark" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System preference</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
