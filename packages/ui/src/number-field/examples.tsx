import type { ComponentDocs } from "../shared/docs";
import { NumberField } from ".";

export const docs: ComponentDocs = {
  slug: "number-field",
  name: "Number Field",
  tier: "form",
  summary: "A compact number input you can type into or scrub by dragging.",
  parts: [
    {
      name: "Root",
      description:
        "Holds the value, `min`, `max`, `step` and `largeStep`. Passes the rest to Base UI's number field.",
    },
    {
      name: "Input",
      description: "The raised text field that shows and edits the number.",
    },
    {
      name: "ScrubArea",
      description:
        "A label or unit inside the field. Dragging it sideways changes the value. Before `Input` it leads, after it trails.",
    },
  ],
  keyboard: [
    { keys: "ArrowUp", action: "Increases the value by one step" },
    { keys: "ArrowDown", action: "Decreases the value by one step" },
    { keys: "Shift + Arrow", action: "Steps by `largeStep`" },
  ],
  accessibility: [
    "The input is a spinbutton-style text field named by `aria-label` on `Input`.",
    "Scrubbing locks the pointer while dragging and shows its own cursor.",
  ],
  examples: [
    {
      name: "Default",
      render: () => (
        <NumberField.Root defaultValue={12} min={0} max={64}>
          <NumberField.Input aria-label="Gap" />
        </NumberField.Root>
      ),
    },
    {
      name: "Leading Label",
      render: () => (
        <NumberField.Root defaultValue={240} min={0}>
          <NumberField.ScrubArea>W</NumberField.ScrubArea>
          <NumberField.Input aria-label="Width" />
        </NumberField.Root>
      ),
    },
    {
      name: "Trailing Unit",
      render: () => (
        <NumberField.Root defaultValue={8} min={0} max={32} largeStep={4}>
          <NumberField.Input aria-label="Corner Radius" />
          <NumberField.ScrubArea>px</NumberField.ScrubArea>
        </NumberField.Root>
      ),
    },
  ],
};
