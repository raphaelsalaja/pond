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
 * Trash retention. The cron in main reads `prefs.trash.autoEmptyDays`
 * once per hour and purges anything older — see
 * `apps/desktop/src/main/core/library-ops.ts` `emptyTrashOlderThan`.
 *
 * The confirm-before-empty switch gates the AlertDialog wrapper in
 * `pages/trash-view/index.tsx` — when off, "Empty Trash" hits the
 * IPC directly with no second prompt.
 */
export function TrashPrefsSection() {
  const [prefs, patch] = usePrefs("trash");
  const value =
    prefs.autoEmptyDays === null ? "never" : String(prefs.autoEmptyDays);
  return (
    <SectionStack>
      <SectionHeader
        title="Trash"
        description="Retention policy for items moved to the trash."
      />

      <SettingsCard title="Retention">
        <Row
          label="Auto-empty trash"
          description="Background sweep runs hourly and permanently deletes saves older than the chosen window."
          control={
            <Select
              value={value}
              onValueChange={(v) =>
                patch({ autoEmptyDays: v === "never" ? null : Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">Never</SelectItem>
                <SelectItem value="7">After 7 days</SelectItem>
                <SelectItem value="30">After 30 days</SelectItem>
                <SelectItem value="90">After 90 days</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <Row
          label="Confirm before emptying"
          description="Show a confirmation dialog when the user clicks Empty Trash. Off skips the prompt."
          control={
            <Switch
              checked={prefs.confirmBeforeEmpty}
              onCheckedChange={(v) => patch({ confirmBeforeEmpty: v })}
            />
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
