import { Checkbox } from ".";
import type { ComponentDocs } from "../shared/docs";

const row = { display: "inline-flex", alignItems: "center", gap: 8 } as const;

export const docs: ComponentDocs = {
  slug: "checkbox",
  name: "Checkbox",
  tier: "form",
  summary: "Turns one option on or off, or shows a mixed state for a group.",
  parts: [
    { name: "Checkbox.Root", description: "The box. `size` is sm or md." },
    {
      name: "Checkbox.Indicator",
      description: "Draws the check or the dash for a mixed state.",
    },
    {
      name: "Checkbox.Mark",
      description:
        "The look with no control, for a menu row that is the checkbox itself.",
    },
  ],
  keyboard: [{ keys: "Space", action: "Toggles the checkbox" }],
  accessibility: [
    'Exposes `role="checkbox"` with `aria-checked`, or `mixed` when indeterminate.',
    "Name it with a `<label htmlFor>`, a `Field.Label` or `aria-label`.",
  ],
  examples: [
    {
      name: "Unchecked",
      render: () => (
        <div style={row}>
          <Checkbox.Root id="checkbox-sync-folders">
            <Checkbox.Indicator />
          </Checkbox.Root>
          <label htmlFor="checkbox-sync-folders">Sync Folders</label>
        </div>
      ),
    },
    {
      name: "Checked",
      render: () => (
        <div style={row}>
          <Checkbox.Root id="checkbox-play-sounds" defaultChecked>
            <Checkbox.Indicator />
          </Checkbox.Root>
          <label htmlFor="checkbox-play-sounds">Play Sounds</label>
        </div>
      ),
    },
    {
      name: "Indeterminate",
      render: () => (
        <Checkbox.Root aria-label="Select All Saves" indeterminate>
          <Checkbox.Indicator />
        </Checkbox.Root>
      ),
    },
    {
      name: "Disabled",
      render: () => (
        <div style={row}>
          <Checkbox.Root id="checkbox-fetch-sources" disabled>
            <Checkbox.Indicator />
          </Checkbox.Root>
          <label htmlFor="checkbox-fetch-sources">
            Fetch Sources on Launch
          </label>
        </div>
      ),
    },
  ],
};
