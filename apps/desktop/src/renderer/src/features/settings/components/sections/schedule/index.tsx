import { FetchRecurrenceSchema } from "@pond/schema";
import { DEFAULT_SYNC_CRON } from "@pond/schema/db";
import { Input, Select, Settings, Switch, Toggle, ToggleGroup } from "@pond/ui";
import type { SyncSchedule } from "@shared/sync-schedule";
import { useId, useRef, useState } from "react";
import { AnimateHeight } from "@/shared/components/animate-height";
import { savePrefsSection, usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export function ScheduleSection() {
  const [sync, , loaded] = usePrefs("sync");
  return (
    <>
      <LaunchFetchControl initial={loaded ? sync.launch : null} />
      <ScheduleEditor
        initial={loaded ? (sync.cron ?? DEFAULT_SYNC_CRON) : null}
        onSave={(cron) => savePrefsSection("sync", { cron })}
      />
    </>
  );
}

export function LaunchFetchControl({ initial }: { initial: boolean | null }) {
  const enabled = initial ?? false;
  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle id="fetch-on-launch-title">
            Fetch on app launch
          </Settings.ItemTitle>
          <Settings.ItemDescription id="fetch-on-launch-description">
            Check eligible sources for new saves once when Pond starts.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Switch.Root
            aria-labelledby="fetch-on-launch-title"
            aria-describedby="fetch-on-launch-description"
            checked={enabled}
            disabled={initial === null}
            onCheckedChange={(launch) =>
              void savePrefsSection("sync", { launch })
            }
          />
        </Settings.ItemControl>
      </Settings.Item>
    </Settings.List>
  );
}

const LOADING_SCHEDULE: SyncSchedule = { ...DEFAULT_SYNC_CRON, enabled: false };

function draftFrom(initial: SyncSchedule) {
  return {
    enabled: initial.enabled,
    unit:
      initial.recurrence?.unit ??
      (initial.calendar?.kind === "weekly"
        ? "week"
        : initial.calendar
          ? "day"
          : ("hour" as const)),
    every: String(
      initial.recurrence?.every ??
        (initial.calendar ? 1 : initial.intervalHours),
    ),
    startDate: initial.recurrence?.startDate ?? localDate(new Date()),
    time: initial.recurrence?.time ?? initial.calendar?.time ?? "18:00",
    days:
      initial.recurrence?.days ??
      (initial.calendar?.kind === "weekly"
        ? initial.calendar.days
        : [new Date().getDay()]),
  };
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const units = ["hour", "day", "week", "month"] as const;

export function ScheduleEditor({
  initial: loadedInitial,
  onSave,
}: {
  initial: SyncSchedule | null;
  onSave: (schedule: SyncSchedule) => void | Promise<void>;
}) {
  const scheduleId = useId();
  const initial = loadedInitial ?? LOADING_SCHEDULE;
  const [draft, setDraft] = useState(() => draftFrom(initial));
  const [seeded, setSeeded] = useState(loadedInitial !== null);
  if (!seeded && loadedInitial) {
    setSeeded(true);
    setDraft(draftFrom(loadedInitial));
  }
  const loading = !seeded;
  const { enabled, unit, every, startDate, time, days } = draft;
  const pendingSave = useRef(Promise.resolve());
  const revision = useRef(0);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const parsed = FetchRecurrenceSchema.safeParse({
    startDate,
    every: Number(every),
    unit,
    time,
    days,
  });
  const valid = !enabled || parsed.success;
  const edit = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    const currentRevision = ++revision.current;
    const recurrence = FetchRecurrenceSchema.safeParse({
      ...next,
      every: Number(next.every),
    });
    if (next.enabled && !recurrence.success) {
      setStatus("idle");
      return;
    }
    const schedule: SyncSchedule = {
      ...initial,
      enabled: next.enabled,
      calendar: null,
      recurrence: recurrence.success ? recurrence.data : initial.recurrence,
    };
    setStatus("saving");
    pendingSave.current = pendingSave.current
      .then(() => onSave(schedule))
      .then(() => {
        if (revision.current === currentRevision) setStatus("idle");
      })
      .catch(() => {
        if (revision.current === currentRevision) setStatus("error");
      });
  };
  return (
    <div className={styles.editor} aria-busy={loading || undefined}>
      <Settings.List>
        <AnimateHeight initial={false}>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle id={`${scheduleId}-title`}>
                Use a Schedule
              </Settings.ItemTitle>
              <Settings.ItemDescription id={`${scheduleId}-description`}>
                Fetch updates automatically at the times you choose.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                aria-labelledby={`${scheduleId}-title`}
                aria-describedby={`${scheduleId}-description`}
                aria-controls={enabled ? scheduleId : undefined}
                checked={enabled}
                disabled={loading}
                onCheckedChange={(checked) => {
                  edit({ enabled: checked });
                }}
              />
            </Settings.ItemControl>
          </Settings.Item>
          {enabled ? (
            <fieldset id={scheduleId} className={styles.picker}>
              <legend className={styles.hidden}>Fetch schedule</legend>
              <div className={styles.sentence}>
                <span className={styles.phrase}>
                  Starting{" "}
                  <Input.Root size="sm" className={styles.date}>
                    <Input.Field
                      aria-label="Start date"
                      type="date"
                      required
                      value={startDate}
                      onChange={(event) =>
                        edit({ startDate: event.target.value })
                      }
                    />
                  </Input.Root>
                </span>
                <span className={styles.phrase}>
                  every{" "}
                  <Input.Root size="sm" className={styles.interval}>
                    <Input.Field
                      aria-label="Repeat interval"
                      type="number"
                      min="1"
                      max="999"
                      step="1"
                      required
                      value={every}
                      onChange={(event) => edit({ every: event.target.value })}
                    />
                  </Input.Root>
                  <ScheduleSelect
                    label="Repeat"
                    value={unit}
                    items={units.map((value) => ({
                      value,
                      label: Number(every) === 1 ? value : `${value}s`,
                    }))}
                    onChange={(selected) => {
                      edit({ unit: selected });
                    }}
                  />
                </span>
                {unit !== "hour" ? (
                  <span className={styles.phrase}>
                    at{" "}
                    <Input.Root size="sm" className={styles.time}>
                      <Input.Field
                        aria-label="Fetch time"
                        type="time"
                        required
                        value={time}
                        onChange={(event) => edit({ time: event.target.value })}
                      />
                    </Input.Root>
                  </span>
                ) : null}
              </div>
              {unit === "week" ? (
                <fieldset className={styles.week}>
                  <legend>On these days</legend>
                  <ToggleGroup
                    multiple
                    className={styles.days}
                    aria-label="Days of week"
                    value={days.map(String)}
                    onValueChange={(values) => {
                      edit({
                        days: values
                          .map(Number)
                          .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)),
                      });
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                      <Toggle
                        key={day}
                        type="button"
                        size="sm"
                        value={String(day)}
                        aria-label={weekdayNames[day]}
                      >
                        {weekdayNames[day]?.slice(0, 3)}
                      </Toggle>
                    ))}
                  </ToggleGroup>
                </fieldset>
              ) : null}
            </fieldset>
          ) : null}
        </AnimateHeight>
      </Settings.List>
      {enabled && unit === "month" && Number(startDate.slice(-2)) > 28 ? (
        <p className={styles.zone}>Shorter months use their last day.</p>
      ) : null}
      {!valid ? (
        <p className={styles.error} role="alert">
          {unit === "week" && !days.length
            ? "Choose at least one day."
            : "Choose a valid date, time, and whole number from 1 to 999."}
        </p>
      ) : null}
      {status === "error" ? (
        <p className={styles.error} role="alert">
          Couldn't save your schedule. Change a setting to try again.
        </p>
      ) : null}
    </div>
  );
}

function ScheduleSelect<Value extends string>({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: Value;
  items: { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <Select.Root
      value={value}
      items={items}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      <Select.Trigger size="sm" aria-label={label}>
        <Select.Value />
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Items items={items} />
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
