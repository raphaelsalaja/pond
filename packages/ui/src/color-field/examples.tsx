import { useState } from "react";
import type { ComponentDocs } from "../shared/docs";
import { ColorField } from ".";

function LiveField({ label, initial }: { label: string; initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ColorField.Root aria-label={label} value={value} onChange={setValue} />
  );
}

function LivePicker() {
  const [value, setValue] = useState("#0087ef");
  return (
    <ColorField.Picker
      ariaLabel="Highlight Color"
      value={value}
      onChange={setValue}
    />
  );
}

export const docs: ComponentDocs = {
  slug: "color-field",
  name: "Color Field",
  tier: "form",
  summary:
    "Picks a hex color from a swatch popover or a typed value. Partial hex never applies.",
  parts: [
    {
      name: "ColorField.Root",
      description: "A swatch that opens the picker, next to a hex field.",
    },
    {
      name: "ColorField.Picker",
      description: "The saturation and brightness area beside a hue slider.",
    },
    {
      name: "ColorField.PickerRoot",
      description: "Holds the color for a custom layout of `Area` and `Hue`.",
    },
    {
      name: "ColorField.Area",
      description: "Drags saturation across and brightness up.",
    },
    {
      name: "ColorField.Hue",
      description: "A hue slider, vertical by default.",
    },
  ],
  keyboard: [
    { keys: "Enter", action: "Opens the picker from the swatch" },
    {
      keys: "Arrow keys",
      action: "Move the area thumb or step the hue slider",
    },
    { keys: "Shift + Arrow keys", action: "Move ten steps" },
    { keys: "Page Up / Page Down", action: "Move a tenth of the range" },
    { keys: "Home / End", action: "Move to the start or end" },
    {
      keys: "Escape",
      action: "Closes the picker and returns focus to the swatch",
    },
  ],
  accessibility: [
    "The swatch is a button named `{label} picker`, and the field is named `{label} hex`.",
    'The picker is a group named by `ariaLabel`. Both thumbs expose `role="slider"`.',
    "Name it with `aria-label` on `Root`, or `ariaLabel` on `Picker` and `PickerRoot`.",
  ],
  examples: [
    {
      name: "Swatch and Hex",
      render: () => <LiveField label="Accent Color" initial="#0087ef" />,
    },
    {
      name: "Empty",
      render: () => <LiveField label="Border Color" initial="" />,
    },
    {
      name: "Inline Picker",
      render: () => <LivePicker />,
    },
  ],
};
