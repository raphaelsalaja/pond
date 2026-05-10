import { Select, Switch } from "@pond/ui";
import { Settings } from "@/components/settings";
import { usePrefs } from "@/pool/prefs";

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
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Trash</Settings.Title>
        <Settings.Description>
          How long Pond keeps deleted items before sweeping them.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>Retention</Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Auto-Empty Trash</Settings.ItemTitle>
              <Settings.ItemDescription>
                An hourly sweep permanently deletes saves older than the chosen
                window.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={value}
                onValueChange={(v) =>
                  patch({ autoEmptyDays: v === "never" ? null : Number(v) })
                }
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="never">Never</Select.Item>
                  <Select.Item value="7">{"After 7\u00A0days"}</Select.Item>
                  <Select.Item value="30">{"After 30\u00A0days"}</Select.Item>
                  <Select.Item value="90">{"After 90\u00A0days"}</Select.Item>
                </Select.Content>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Confirm Before Emptying</Settings.ItemTitle>
              <Settings.ItemDescription>
                Ask before Empty Trash deletes everything.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.confirmBeforeEmpty}
                onCheckedChange={(v) => patch({ confirmBeforeEmpty: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>
    </Settings.Page>
  );
}
