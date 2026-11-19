import type { ComponentDocs } from "../shared/docs";
import { DatePicker } from ".";

function ignore(): void {}

export const docs: ComponentDocs = {
  slug: "date-picker",
  name: "Date Picker",
  tier: "form",
  summary: "Picks one day from a month calendar in a popover.",
  parts: [
    {
      name: "value",
      description: "Local `YYYY-MM-DD`. Empty shows the placeholder.",
    },
    {
      name: "min / max",
      description: "Earliest and latest days you can pick.",
    },
    { name: "size", description: "Trigger size, matching Button sizes." },
    {
      name: "aria-label",
      description: "Names the trigger; the chosen day is appended.",
    },
    {
      name: "DatePopover",
      description:
        "Opens the same calendar beside an `anchor` element with no trigger, for menu actions.",
    },
  ],
  keyboard: [
    {
      keys: "Enter / Space",
      action: "Opens the calendar, or picks the focused day",
    },
    { keys: "Arrow keys", action: "Move by one day or one week" },
    { keys: "Home / End", action: "Move to the first or last day of the week" },
    { keys: "PageUp / PageDown", action: "Move by one month" },
    { keys: "Shift + PageUp / PageDown", action: "Move by one year" },
    {
      keys: "Escape",
      action: "Closes the calendar and returns focus to the trigger",
    },
  ],
  accessibility: [
    'The calendar is a `role="grid"` named by its month, with one focusable day at a time.',
    'The picked day has `aria-selected`; today has `aria-current="date"`.',
    "Days outside `min` and `max` are `aria-disabled` and can't take focus.",
    "Name the trigger with `aria-label`.",
  ],
  examples: [
    {
      name: "Empty",
      render: () => (
        <DatePicker
          aria-label="Imported After"
          locale="en-US"
          value=""
          onValueChange={ignore}
        />
      ),
    },
    {
      name: "Selected",
      render: () => (
        <DatePicker
          aria-label="Imported After"
          locale="en-US"
          value="2026-01-15"
          onValueChange={ignore}
        />
      ),
    },
    {
      name: "Disabled",
      render: () => (
        <DatePicker
          aria-label="Imported After"
          locale="en-US"
          value="2026-01-15"
          onValueChange={ignore}
          disabled
        />
      ),
    },
  ],
};
