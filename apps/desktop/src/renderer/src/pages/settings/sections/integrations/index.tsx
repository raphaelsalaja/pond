import { IconChevronExpandYOutline12 } from "@pond/icons/outline/12";
import {
  DEFAULT_GLOBAL_SYNC_PREFS,
  type GlobalSyncPrefs,
  type SyncFrequency,
} from "@pond/schema/db";
import {
  Button,
  Dialog,
  Field,
  Input,
  Select,
  Switch,
  useToast,
} from "@pond/ui";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { Settings } from "@/components/settings";
import { SourceBadge } from "@/components/source-badge";
import { usePrefs } from "@/pool/prefs";
import { ALL_SOURCES, type AnySource, SOURCE_DESCRIPTIONS } from "../_types";
import styles from "./styles.module.css";

const FREQUENCY_OPTIONS: Array<{ value: SyncFrequency; label: string }> = [
  { value: "hourly", label: "Hourly" },
  { value: "every6h", label: "Every 6\u00A0hours" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const WEEKDAYS: Array<{ index: number; short: string; full: string }> = [
  { index: 0, short: "S", full: "Sunday" },
  { index: 1, short: "M", full: "Monday" },
  { index: 2, short: "T", full: "Tuesday" },
  { index: 3, short: "W", full: "Wednesday" },
  { index: 4, short: "T", full: "Thursday" },
  { index: 5, short: "F", full: "Friday" },
  { index: 6, short: "S", full: "Saturday" },
];

type RepeatPreset =
  | "every_hour"
  | "every_6h"
  | "every_day"
  | "every_weekday"
  | "every_weekend"
  | "custom";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_INDICES = [1, 2, 3, 4, 5];
const WEEKEND_INDICES = [0, 6];

const REPEAT_PRESETS: Array<{
  value: Exclude<RepeatPreset, "custom">;
  label: string;
  secondary?: string;
}> = [
  { value: "every_hour", label: "Every hour" },
  { value: "every_6h", label: "Every 6\u00A0hours" },
  { value: "every_day", label: "Every day" },
  { value: "every_weekday", label: "Every weekday", secondary: "Mon\u2013Fri" },
  { value: "every_weekend", label: "Every weekend", secondary: "Sat\u2013Sun" },
];

function setEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const n of b) if (!sa.has(n)) return false;
  return true;
}

function presetFromPrefs(prefs: GlobalSyncPrefs): RepeatPreset {
  switch (prefs.frequency) {
    case "hourly":
      return "every_hour";
    case "every6h":
      return "every_6h";
    case "daily":
      return setEqual(prefs.weekdays, ALL_DAYS) ? "every_day" : "custom";
    case "weekly":
      if (setEqual(prefs.weekdays, ALL_DAYS)) return "every_day";
      if (setEqual(prefs.weekdays, WEEKDAY_INDICES)) return "every_weekday";
      if (setEqual(prefs.weekdays, WEEKEND_INDICES)) return "every_weekend";
      return "custom";
    default:
      return "custom";
  }
}

function applyPreset(
  preset: Exclude<RepeatPreset, "custom">,
): Partial<GlobalSyncPrefs> {
  switch (preset) {
    case "every_hour":
      return { frequency: "hourly", weekdays: ALL_DAYS };
    case "every_6h":
      return { frequency: "every6h", weekdays: ALL_DAYS };
    case "every_day":
      return { frequency: "daily", weekdays: ALL_DAYS };
    case "every_weekday":
      return { frequency: "weekly", weekdays: WEEKDAY_INDICES };
    case "every_weekend":
      return { frequency: "weekly", weekdays: WEEKEND_INDICES };
  }
}

function formatRepeatTrigger(prefs: GlobalSyncPrefs): string {
  const preset = presetFromPrefs(prefs);
  if (preset !== "custom") {
    return REPEAT_PRESETS.find((p) => p.value === preset)?.label ?? "Custom";
  }
  if (prefs.frequency === "weekly") {
    const days = [...prefs.weekdays].sort((a, b) => a - b);
    if (days.length === 1) {
      const w = WEEKDAYS[days[0] as number];
      return w ? `Every ${w.full}` : "Custom";
    }
    return days
      .map((d) => WEEKDAYS[d]?.full.slice(0, 3))
      .filter(Boolean)
      .join(", ");
  }
  return "Custom";
}

function frequencyHasAnchor(frequency: SyncFrequency): boolean {
  return frequency === "daily" || frequency === "weekly";
}

function emptyConnectedRecord(): Record<AnySource, boolean> {
  return Object.fromEntries(ALL_SOURCES.map((s) => [s.id, false])) as Record<
    AnySource,
    boolean
  >;
}

export function IntegrationsSection() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [syncPrefs, patchSync, syncReady] = usePrefs("sync");
  const [connected, setConnected] =
    useState<Record<AnySource, boolean>>(emptyConnectedRecord);
  const [statusReady, setStatusReady] = useState(false);
  const [pendingSource, setPendingSource] = useState<AnySource | null>(null);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  const refreshStatuses = useCallback(async () => {
    const entries = await Promise.all(
      ALL_SOURCES.map(async ({ id }) => {
        const r = await window.pond.sourceStatus(id).catch(() => null);
        return [id, r?.ok ? r.connected : false] as const;
      }),
    );
    const next = emptyConnectedRecord();
    for (const [id, isConnected] of entries) {
      next[id] = isConnected;
    }
    setConnected(next);
    setStatusReady(true);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      await refreshStatuses();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [refreshStatuses]);

  useEffect(() => {
    const off = window.pond.onSourceStatus((update) => {
      setConnected((prev) => ({
        ...prev,
        [update.source as AnySource]: update.connected,
      }));
      if (update.connected) {
        toast.add({
          title: `Connected ${update.source}`,
          description: "Pond received your session from the browser extension.",
          type: "success",
        });
      }
    });
    return () => off();
  }, [toast]);

  const connectSource = useCallback(
    async (source: AnySource) => {
      setPendingSource(source);
      try {
        const res = await window.pond.connectSource(source);
        if (res.ok) {
          toast.add({
            title: `Sign in to ${source} in your browser`,
            description:
              "After signing in, open the Pond extension popup and click " +
              `"Push session". Pond will pick the cookies up automatically.`,
            type: "info",
          });
        } else {
          toast.add({
            title: `Couldn't open ${source} in your browser`,
            type: "error",
          });
        }
      } catch {
        toast.add({
          title: `Couldn't open ${source} in your browser`,
          type: "error",
        });
      } finally {
        setPendingSource(null);
      }
    },
    [toast],
  );

  const autoConnectFired = useRef(false);
  useEffect(() => {
    const wanted = params.get("connect");
    if (!wanted || autoConnectFired.current) return;
    const match = ALL_SOURCES.find((s) => s.id === wanted);
    if (!match) return;
    autoConnectFired.current = true;
    void connectSource(match.id);
    const next = new URLSearchParams(params);
    next.delete("connect");
    setParams(next, { replace: true });
  }, [params, setParams, connectSource]);

  const global = syncReady ? syncPrefs.global : DEFAULT_GLOBAL_SYNC_PREFS;
  const scheduleKey = useMemo(
    () =>
      `${global.enabled}|${global.frequency}|${global.anchorTime}|${(
        global.weekdays ?? []
      ).join(
        ",",
      )}|${global.quietHours?.start ?? ""}-${global.quietHours?.end ?? ""}`,
    [global],
  );
  const schedule = useScheduleStatus(scheduleKey);
  const runningSources = useRunningSources();
  const anyRunning = runningSources.size > 0;

  const patchGlobal = useCallback(
    (delta: Partial<GlobalSyncPrefs>) => {
      if (!syncReady) return;
      patchSync({ global: { ...syncPrefs.global, ...delta } });
    },
    [patchSync, syncReady, syncPrefs.global],
  );

  function toggleQuietHours(on: boolean) {
    patchGlobal({ quietHours: on ? { start: "22:00", end: "07:00" } : null });
  }

  async function syncNow() {
    try {
      await window.pond.syncRunAll();
      toast.add({
        title: "Sync started",
        description: "Pond is checking every connected source.",
        type: "info",
      });
    } catch {
      toast.add({ title: "Couldn't start sync", type: "error" });
    }
  }

  function handlePresetChange(value: RepeatPreset) {
    if (value === "custom") {
      setCustomDialogOpen(true);
      return;
    }
    patchGlobal(applyPreset(value));
  }

  const activePreset = presetFromPrefs(global);
  const showAnchor = frequencyHasAnchor(global.frequency);
  const controlsDisabled = !syncReady || !global.enabled;

  async function disconnect(source: AnySource) {
    setPendingSource(source);
    try {
      await window.pond.disconnectSource(source);
      await refreshStatuses();
    } finally {
      setPendingSource(null);
    }
  }

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Connected Apps</Settings.Title>
        <Settings.Description>
          Connect your apps to enable seamless background syncing.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <div className={styles["section-header"]}>
          <Settings.SectionTitle>Configuration</Settings.SectionTitle>
          <Button
            size="sm"
            disabled={!syncReady || anyRunning}
            onClick={() => void syncNow()}
          >
            {anyRunning ? "Syncing\u2026" : "Sync now"}
          </Button>
        </div>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Background Sync</Settings.ItemTitle>
              <Settings.ItemDescription>
                Automatically check for new saves on the schedule below.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                disabled={!syncReady}
                checked={global.enabled}
                onCheckedChange={(v) => patchGlobal({ enabled: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Frequency</Settings.ItemTitle>
              <Settings.ItemDescription>
                How often Pond checks for new saves.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root<RepeatPreset>
                disabled={controlsDisabled}
                value={activePreset}
                onValueChange={(v) =>
                  handlePresetChange((v ?? "every_day") as RepeatPreset)
                }
              >
                <Select.Trigger>
                  <Select.Value>{formatRepeatTrigger(global)}</Select.Value>
                  <Select.Icon>
                    <IconChevronExpandYOutline12 />
                  </Select.Icon>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Positioner sideOffset={6}>
                    <Select.Popup>
                      {REPEAT_PRESETS.map((o) => (
                        <Select.Item key={o.value} value={o.value}>
                          <span className={styles["preset-label"]}>
                            {o.label}
                          </span>
                          {o.secondary ? (
                            <span className={styles["preset-secondary"]}>
                              {o.secondary}
                            </span>
                          ) : null}
                        </Select.Item>
                      ))}
                      <div className={styles["preset-separator"]} aria-hidden />
                      <Select.Item value="custom">
                        <span className={styles["preset-label"]}>
                          {"Custom\u2026"}
                        </span>
                      </Select.Item>
                    </Select.Popup>
                  </Select.Positioner>
                </Select.Portal>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>

          {showAnchor ? (
            <Settings.Item>
              <Settings.ItemDetails>
                <Settings.ItemTitle>Time</Settings.ItemTitle>
                <Settings.ItemDescription>
                  Local time of day when the sync runs.
                </Settings.ItemDescription>
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <Input
                  type="time"
                  data-size="sm"
                  className={styles["inline-time"]}
                  disabled={controlsDisabled}
                  value={global.anchorTime}
                  onChange={(e) =>
                    patchGlobal({ anchorTime: e.currentTarget.value })
                  }
                />
              </Settings.ItemControl>
            </Settings.Item>
          ) : null}

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Quiet hours</Settings.ItemTitle>
              <Settings.ItemDescription>
                Don't sync between these hours, even when due.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <div className={styles["quiet-hours-row"]}>
                <Switch.Root
                  disabled={controlsDisabled}
                  checked={Boolean(global.quietHours)}
                  onCheckedChange={(v) => toggleQuietHours(v)}
                />
                {global.quietHours ? (
                  <>
                    <Input
                      type="time"
                      data-size="sm"
                      className={styles["inline-time"]}
                      disabled={controlsDisabled}
                      value={global.quietHours.start}
                      onChange={(e) =>
                        patchGlobal({
                          quietHours: {
                            start: e.currentTarget.value,
                            end:
                              global.quietHours?.end ??
                              DEFAULT_GLOBAL_SYNC_PREFS.anchorTime,
                          },
                        })
                      }
                    />
                    <span className={styles["quiet-hours-sep"]}>to</span>
                    <Input
                      type="time"
                      data-size="sm"
                      className={styles["inline-time"]}
                      disabled={controlsDisabled}
                      value={global.quietHours.end}
                      onChange={(e) =>
                        patchGlobal({
                          quietHours: {
                            start:
                              global.quietHours?.start ??
                              DEFAULT_GLOBAL_SYNC_PREFS.anchorTime,
                            end: e.currentTarget.value,
                          },
                        })
                      }
                    />
                  </>
                ) : null}
              </div>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Only when plugged in</Settings.ItemTitle>
              <Settings.ItemDescription>
                Skip scheduled syncs while running on battery.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                disabled={controlsDisabled}
                checked={global.onlyOnAcPower}
                onCheckedChange={(v) => patchGlobal({ onlyOnAcPower: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Only on Wi-Fi</Settings.ItemTitle>
              <Settings.ItemDescription>
                Skip scheduled syncs on cellular or tethered networks.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                disabled={controlsDisabled}
                checked={global.onlyOnWifi}
                onCheckedChange={(v) => patchGlobal({ onlyOnWifi: v })}
              />
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
        <p className={styles["status-footer"]}>
          {formatScheduleFooter(schedule, global.enabled)}
        </p>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Apps</Settings.SectionTitle>
        <Settings.List>
          {ALL_SOURCES.map((entry) => {
            const isConnected = connected[entry.id];
            const isPending = pendingSource === entry.id;
            return (
              <Fragment key={entry.id}>
                <Settings.Item className={styles["app-row"]}>
                  <SourceBadge.Root source={entry.id} data-size="md" />
                  <Settings.ItemDetails>
                    <Settings.ItemTitle>{entry.label}</Settings.ItemTitle>
                    <Settings.ItemDescription>
                      {SOURCE_DESCRIPTIONS[entry.id]}
                    </Settings.ItemDescription>
                  </Settings.ItemDetails>
                  <Settings.ItemControl>
                    {!statusReady ? (
                      <span
                        className={styles["app-row-skeleton-button"]}
                        aria-hidden
                      />
                    ) : isConnected ? (
                      <ConnectedButton
                        disabled={isPending}
                        onClick={() => void disconnect(entry.id)}
                      />
                    ) : (
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() => void connectSource(entry.id)}
                      >
                        {isPending ? "Opening\u2026" : "Sign in"}
                      </Button>
                    )}
                  </Settings.ItemControl>
                </Settings.Item>
              </Fragment>
            );
          })}
          {!statusReady ? (
            <Settings.Item className={styles["app-row-skeleton"]} aria-hidden>
              <span className={styles["app-row-skeleton-badge"]} />
              <Settings.ItemDetails>
                <span className={styles["app-row-skeleton-line"]} />
              </Settings.ItemDetails>
              <Settings.ItemControl>
                <span className={styles["app-row-skeleton-button"]} />
              </Settings.ItemControl>
            </Settings.Item>
          ) : null}
        </Settings.List>
      </Settings.Section>

      <RepeatCustomDialog
        open={customDialogOpen}
        initial={global}
        onClose={() => setCustomDialogOpen(false)}
        onSubmit={(next) => {
          patchGlobal(next);
          setCustomDialogOpen(false);
        }}
      />
    </Settings.Page>
  );
}

interface ScheduleStatus {
  lastFireAt: string | null;
  nextDueAt: string | null;
}

function useScheduleStatus(refreshKey: string): ScheduleStatus {
  const [status, setStatus] = useState<ScheduleStatus>({
    lastFireAt: null,
    nextDueAt: null,
  });

  useEffect(() => {
    void refreshKey;
    let active = true;
    void window.pond.syncSchedulePeek().then((res) => {
      if (!active || !res.ok) return;
      setStatus({ lastFireAt: res.lastFireAt, nextDueAt: res.nextDueAt });
    });
    const off = window.pond.onSyncSchedule((u) => {
      if (!active) return;
      setStatus({ lastFireAt: u.lastFireAt, nextDueAt: u.nextDueAt });
    });
    return () => {
      active = false;
      off();
    };
  }, [refreshKey]);

  return status;
}

function useRunningSources(): Set<string> {
  const [running, setRunning] = useState<Set<string>>(new Set());
  useEffect(() => {
    return window.pond.onSyncStatus((u) => {
      setRunning((prev) => {
        const next = new Set(prev);
        if (u.state === "running") next.add(u.source);
        else next.delete(u.source);
        return next;
      });
    });
  }, []);
  return running;
}

function formatScheduleFooter(
  status: ScheduleStatus,
  enabled: boolean,
): string {
  const parts: string[] = [];
  parts.push(
    status.lastFireAt
      ? `Last sync ${formatRelative(new Date(status.lastFireAt))}`
      : "No syncs yet",
  );
  if (enabled) {
    if (status.nextDueAt) {
      const due = new Date(status.nextDueAt);
      parts.push(
        due.getTime() <= Date.now()
          ? "Next sync due now"
          : `Next sync ${formatRelative(due)}`,
      );
    } else {
      parts.push("Schedule misconfigured");
    }
  } else {
    parts.push("Background sync is off");
  }
  return parts.join(" \u00B7 ");
}

const RELATIVE_FMT = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60_000],
  ["month", 30 * 24 * 60 * 60_000],
  ["week", 7 * 24 * 60 * 60_000],
  ["day", 24 * 60 * 60_000],
  ["hour", 60 * 60_000],
  ["minute", 60_000],
];

function formatRelative(at: Date): string {
  const diff = at.getTime() - Date.now();
  const abs = Math.abs(diff);
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (abs >= ms) {
      const value = Math.round(diff / ms);
      return RELATIVE_FMT.format(value, unit);
    }
  }
  return RELATIVE_FMT.format(Math.round(diff / 1000), "second");
}

function ConnectedButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className={styles["connected-button"]}
      data-state={hover ? "hover" : "idle"}
    >
      {disabled ? "\u2026" : hover ? "Disconnect" : "Connected"}
    </Button>
  );
}

function RepeatCustomDialog({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: GlobalSyncPrefs;
  onClose: () => void;
  onSubmit: (next: Partial<GlobalSyncPrefs>) => void;
}) {
  const [draftFrequency, setDraftFrequency] = useState<SyncFrequency>(
    initial.frequency,
  );
  const [draftWeekdays, setDraftWeekdays] = useState<number[]>(
    initial.weekdays ?? ALL_DAYS,
  );

  useEffect(() => {
    if (open) {
      setDraftFrequency(initial.frequency);
      setDraftWeekdays(initial.weekdays ?? ALL_DAYS);
    }
  }, [open, initial.frequency, initial.weekdays]);

  function toggleDraftWeekday(index: number) {
    setDraftWeekdays((prev) => {
      const set = new Set(prev);
      if (set.has(index)) set.delete(index);
      else set.add(index);
      const next = Array.from(set).sort((a, b) => a - b);
      return next.length === 0 ? prev : next;
    });
  }

  const showDays = draftFrequency === "weekly";
  const canSubmit = !showDays || draftWeekdays.length > 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Content>
        <Dialog.Title>Custom schedule</Dialog.Title>
        <Dialog.Description>
          Pick a cadence and the days Pond should run on.
        </Dialog.Description>
        <form
          className={styles["handle-form"]}
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({
              frequency: draftFrequency,
              weekdays: draftFrequency === "weekly" ? draftWeekdays : ALL_DAYS,
            });
          }}
        >
          <Field.Root>
            <Field.Label>Frequency</Field.Label>
            <Select.Root<SyncFrequency>
              value={draftFrequency}
              onValueChange={(v) =>
                setDraftFrequency((v ?? "daily") as SyncFrequency)
              }
            >
              <Select.Trigger>
                <Select.Value>
                  {FREQUENCY_OPTIONS.find((o) => o.value === draftFrequency)
                    ?.label ?? "Daily"}
                </Select.Value>
                <Select.Icon>
                  <IconChevronExpandYOutline12 />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Positioner sideOffset={6}>
                  <Select.Popup>
                    {FREQUENCY_OPTIONS.map((o) => (
                      <Select.Item key={o.value} value={o.value}>
                        {o.label}
                      </Select.Item>
                    ))}
                  </Select.Popup>
                </Select.Positioner>
              </Select.Portal>
            </Select.Root>
          </Field.Root>

          {showDays ? (
            <Field.Root>
              <Field.Label>Days</Field.Label>
              <div className={styles["weekday-chips"]}>
                {WEEKDAYS.map((d) => {
                  const on = draftWeekdays.includes(d.index);
                  return (
                    <button
                      key={d.index}
                      type="button"
                      aria-label={d.full}
                      aria-pressed={on}
                      className={styles["weekday-chip"]}
                      data-on={on ? "true" : "false"}
                      onClick={() => toggleDraftWeekday(d.index)}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
              <Field.Description>
                Sync runs at the time set on the main page, on the days you pick
                here.
              </Field.Description>
            </Field.Root>
          ) : null}

          <div className={styles["handle-actions"]}>
            <Dialog.Close render={<Button size="sm" variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button size="sm" type="submit" disabled={!canSubmit}>
              Save
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
