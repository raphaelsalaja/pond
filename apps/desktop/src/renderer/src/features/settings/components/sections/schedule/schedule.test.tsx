import type { SyncSchedule } from "@shared/sync-schedule";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LaunchFetchControl, ScheduleEditor } from "./";

let root: Root;
let host: HTMLDivElement;
const save = vi.fn<(schedule: SyncSchedule) => void | Promise<void>>();
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
async function render(initial: SyncSchedule | null) {
  await act(async () =>
    root.render(<ScheduleEditor initial={initial} onSave={save} />),
  );
}
async function renderLaunch(initial: boolean | null) {
  await act(async () => root.render(<LaunchFetchControl initial={initial} />));
}
async function choose(label: string, optionLabel: string) {
  const trigger = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!trigger) throw new Error(`Missing ${label} selector`);
  await act(async () => trigger.click());
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (item) => item.textContent === optionLabel,
  );
  if (!(option instanceof HTMLElement))
    throw new Error(`Missing ${optionLabel} option`);
  await act(async () => option.click());
}
async function toggleSchedule() {
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]');
  if (!toggle) throw new Error("Missing schedule switch");
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
  save.mockRejectedValueOnce(new Error("disk unavailable"));
  await render({ enabled: true, intervalHours: 12 });
  await choose("Repeat", "days");
  expect(host.textContent).toContain("Couldn't save your schedule");
  expect(host.textContent).not.toContain("Schedule saved.");
  await choose("Repeat", "weeks");
  expect(save).toHaveBeenCalledTimes(2);
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
  save.mockReturnValueOnce(firstSave.promise);
  await render({ enabled: true, intervalHours: 12 });
  await toggleSchedule();
  await toggleSchedule();
  expect(save).toHaveBeenCalledTimes(1);
  expect(host.querySelector('input[aria-label="Start date"]')).not.toBeNull();
  await act(async () => firstSave.resolve());
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ enabled: false }),
  );
  expect(save).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true }),
  );
});
