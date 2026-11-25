import { Switch } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "switch",
  name: "Switch",
  tier: "form",
  summary: "Turns a setting on or off and applies it right away.",
  parts: [
    {
      name: "Switch.Root",
      description: "The control. Renders a thumb when it has no children.",
    },
    { name: "Switch.Thumb", description: "The moving knob." },
    {
      name: "Switch.Mark",
      description:
        "The look with no control, for a menu row that is the switch itself.",
    },
  ],
  keyboard: [{ keys: "Space", action: "Toggles the switch" }],
  accessibility: [
    'Exposes `role="switch"` with `aria-checked`.',
    "Name it with a `Field.Label` or `aria-label`.",
  ],
  examples: [
    {
      name: "Off",
      render: () => <Switch.Root aria-label="Fetch Sources on Launch" />,
    },
    {
      name: "On",
      render: () => <Switch.Root aria-label="Play Sounds" defaultChecked />,
    },
    {
      name: "Disabled",
      render: () => <Switch.Root aria-label="Sync Folders" disabled />,
    },
  ],
};
