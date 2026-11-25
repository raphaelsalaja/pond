import { Button, Select, Settings, Switch } from "@pond/ui";
import type { SourceTargetInput } from "@shared/account-contracts";
import { describeSyncSchedule } from "@shared/sync-schedule";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  FETCH_INTERVAL_HOURS,
  intervalLabel,
} from "@/features/sources/lib/fetch-prefs";
import type { SourceFetchPrefs } from "@/features/sources/lib/fetch-prefs";
import { openSettings } from "@/shared/lib/open-settings";
import { notify } from "@/shared/lib/toast";
import { usePrefs } from "@/shared/state/prefs";

const DEFAULT = "default";

interface ScheduleDraft {
  paused: boolean;
  intervalHours: number | null;
}

export function SourceSchedule({
  target,
  sync,
  onChanged,
  actions,
}: {
  target: SourceTargetInput;
  sync: SourceFetchPrefs;
  onChanged: () => void;
  actions: ReactNode;
}) {
  const [prefs] = usePrefs("sync");
  const schedule = prefs.cron;
  const [draft, setDraft] = useState<ScheduleDraft>({
    paused: sync.paused === true,
    intervalHours: sync.intervalHours ?? null,
  });
  const save = async (next: ScheduleDraft) => {
    const previous = draft;
    setDraft(next);
    const result = await window.pond.query("sources.setSchedule", {
      ...target,
      ...next,
    });
    if (!result.ok) {
      setDraft(previous);
      notify({
        id: "source-schedule",
        title: "Couldn't save the schedule. Try again.",
      });
      return;
    }
    onChanged();
  };
  const off = !schedule.enabled;
  const items = [
    { value: DEFAULT, label: "Default" },
    ...FETCH_INTERVAL_HOURS.map((hours) => ({
      value: String(hours),
      label: intervalLabel(hours),
    })),
  ];
  const value =
    draft.intervalHours === null ? DEFAULT : String(draft.intervalHours);
  return (
    <>
      <Settings.List>
        <Settings.Item disabled={off}>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Automatic Fetching</Settings.ItemTitle>
            <Settings.ItemDescription>
              {off
                ? "Automatic fetching is off for every source in Settings."
                : "Turn off to fetch this source only when you ask."}
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Switch.Root
              aria-label="Automatic Fetching"
              checked={!off && !draft.paused}
              disabled={off}
              onCheckedChange={(checked) =>
                void save({ ...draft, paused: !checked })
              }
            />
          </Settings.ItemControl>
        </Settings.Item>
        <Settings.Item disabled={off || draft.paused}>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Fetch Interval</Settings.ItemTitle>
            <Settings.ItemDescription>
              Default follows your schedule in Settings.
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Select.Root
              value={value}
              disabled={off || draft.paused}
              onValueChange={(next) => {
                if (!next) return;
                void save({
                  ...draft,
                  intervalHours: next === DEFAULT ? null : Number(next),
                });
              }}
            >
              <Select.Trigger aria-label="Fetch Interval">
                <Select.Value>
                  {(selected: string) =>
                    items.find((item) => item.value === selected)?.label ??
                    selected
                  }
                </Select.Value>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner sideOffset={6}>
                  <Select.Popup>
                    <Select.Items items={items} />
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
          </Settings.ItemControl>
        </Settings.Item>
        <Settings.Item>
          <Settings.ItemDetails>
            <Settings.ItemTitle>Schedule in Settings</Settings.ItemTitle>
            <Settings.ItemDescription>
              {describeSyncSchedule(schedule)}
            </Settings.ItemDescription>
          </Settings.ItemDetails>
          <Settings.ItemControl>
            <Button
              size="sm"
              variant="secondary"
              aria-label="Open Schedule Settings"
              onClick={() => openSettings("schedule")}
            >
              Open
            </Button>
          </Settings.ItemControl>
        </Settings.Item>
      </Settings.List>
      <Settings.Section>
        <Settings.SectionTitle>Fetch Now</Settings.SectionTitle>
        {actions}
      </Settings.Section>
    </>
  );
}
