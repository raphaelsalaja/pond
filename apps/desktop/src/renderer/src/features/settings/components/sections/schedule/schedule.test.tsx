import { isHTMLElement } from "@pond/ui/dom";
import type { SyncSchedule } from "@shared/sync-schedule";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LaunchFetchControl, ScheduleEditor } from "./";

let root: Root;
let host: HTMLDivElement;
type Save = (schedule: SyncSchedule) => void | Promise<void>;
const save = vi.fn<Save>();
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  save.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(initial: SyncSchedule | null, onSave: Save = save) {
  await act(async () =>
    root.render(<ScheduleEditor initial={initial} onSave={onSave} />),
  );
}
async function renderLaunch(initial: boolean | null) {
  await act(async () => root.render(<LaunchFetchControl initial={initial} />));
}
async function choose(label: string, optionLabel: string) {
  const trigger = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!trigger) {
    throw new Error(`Missing ${label} selector`);
  }
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (item) => item.textContent === optionLabel,
  );
  if (!isHTMLElement(option)) {
    throw new Error(`Missing ${optionLabel} option`);
  }
  await act(async () => option.click());
}
async function toggleSchedule() {
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
  if (!toggle) {
    throw new Error("Missing schedule switch");
  }
  await act(async () => toggle.click());
}
it("saves edits automatically without saving on mount", async () => {
  await render({ enabled: true, intervalHours: 12 });
  expect(save).not.toHaveBeenCalled();
  await choose("Repeat", "days");
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      enabled: true,
      recurrence: expect.objectContaining({ unit: "day", every: 12 }),
    }),
  );
  expect(host.textContent).not.toContain("Schedule saved.");
  expect(host.textContent).not.toContain("Next fetch:");
  expect(host.textContent).not.toContain("Save Schedule");
});
it("shows a disabled shell while preferences load, then the saved schedule", async () => {
  await render(null);
  const toggle = host.querySelector('[role="switch"]');
  expect(toggle?.hasAttribute("data-disabled")).toBe(true);
  expect(host.textContent).toContain("Use a Schedule");
  await render({ enabled: true, intervalHours: 6 });
  expect(toggle?.hasAttribute("data-disabled")).toBe(false);
  expect(toggle?.getAttribute("aria-checked")).toBe("true");
  expect(
    host.querySelector('input[aria-label="Repeat interval"]'),
  ).toHaveProperty("value", "6");
  expect(save).not.toHaveBeenCalled();
});
it("shows Fetch on Launch only after preferences load", async () => {
  await renderLaunch(null);
  const toggle = host.querySelector('[role="switch"]');
  expect(toggle?.hasAttribute("data-disabled")).toBe(true);
  expect(host.textContent).toContain("Fetch on Launch");

  await renderLaunch(true);
  expect(toggle?.hasAttribute("data-disabled")).toBe(false);
  expect(toggle?.getAttribute("aria-checked")).toBe("true");
});
it("loads a weekly schedule and prevents saving without weekdays", async () => {
  await render({
    enabled: true,
    intervalHours: 12,
    calendar: { kind: "weekly", time: "14:30", days: [1] },
  });
  expect(host.querySelector('input[type="time"]')).toHaveProperty(
    "value",
    "14:30",
  );
  const monday = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Monday"]',
  );
  await act(async () => monday?.click());
  expect(save).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Choose at least one day.",
  );
});
it("saves manual mode without a calendar rule", async () => {
  await render({
    enabled: true,
    intervalHours: 6,
    calendar: { kind: "daily", time: "09:00" },
  });
  await toggleSchedule();
  expect(
    host.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
  ).toBe("false");
  expect(host.querySelector('input[aria-label="Start date"]')).toBeNull();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      enabled: false,
      recurrence: expect.objectContaining({ unit: "day" }),
    }),
  );
});

it("shows a save failure and keeps the draft available to retry", async () => {
  const attempts: Array<SyncSchedule> = [];
  await render({ enabled: true, intervalHours: 12 }, async (schedule) => {
    attempts.push(schedule);
    if (attempts.length === 1) {
      throw new Error("disk unavailable");
    }
  });
  await choose("Repeat", "days");
  expect(host.textContent).toContain("Couldn't save your schedule");
  expect(host.textContent).not.toContain("Schedule saved.");
  await choose("Repeat", "weeks");
  expect(attempts).toHaveLength(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("retains monthly settings when toggling the schedule off and on", async () => {
  await render({
    enabled: true,
    intervalHours: 12,
    recurrence: {
      startDate: "2026-09-09",
      every: 2,
      unit: "month",
      time: "18:00",
      days: [3],
    },
  });
  await toggleSchedule();
  expect(host.querySelector('input[aria-label="Start date"]')).toBeNull();
  await toggleSchedule();
  expect(
    host.querySelector('[role="switch"]')?.getAttribute("aria-checked"),
  ).toBe("true");
  expect(host.querySelector('input[aria-label="Start date"]')).toHaveProperty(
    "value",
    "2026-09-09",
  );
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({
      enabled: true,
      recurrence: {
        startDate: "2026-09-09",
        every: 2,
        unit: "month",
        time: "18:00",
        days: [3],
      },
    }),
  );
});

it("saves rapid changes in order while keeping the controls available", async () => {
  const firstSave = Promise.withResolvers<void>();
  const saved: Array<SyncSchedule> = [];
  await render({ enabled: true, intervalHours: 12 }, (schedule) => {
    saved.push(schedule);
    return saved.length === 1 ? firstSave.promise : undefined;
  });
  await toggleSchedule();
  await toggleSchedule();
  expect(saved).toHaveLength(1);
  expect(host.querySelector('input[aria-label="Start date"]')).not.toBeNull();
  await act(async () => firstSave.resolve());
  expect(saved).toEqual([
    expect.objectContaining({ enabled: false }),
    expect.objectContaining({ enabled: true }),
  ]);
});
