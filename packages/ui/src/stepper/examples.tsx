import { IconArrowRotateAnticlockwise, IconMinus, IconPlus } from "@pond/icons";
import { Stepper } from ".";
import type { ComponentDocs } from "../shared/docs";

function ignore(): void {}

export const docs: ComponentDocs = {
  slug: "stepper",
  name: "Stepper",
  tier: "form",
  summary: "Steps a whole number up or down between a minimum and maximum.",
  parts: [
    {
      name: "value / min / max",
      description: "The current number and its bounds.",
    },
    {
      name: "step",
      description: "How far each press or arrow key moves. Defaults to 1.",
    },
    {
      name: "decrementIcon / incrementIcon",
      description: "Icons for the Decrease and Increase buttons.",
    },
    {
      name: "resetIcon",
      description: "Shows a Reset button that returns to `fallback`.",
    },
  ],
  keyboard: [
    { keys: "ArrowUp", action: "Increases the value by one step" },
    { keys: "ArrowDown", action: "Decreases the value by one step" },
    {
      keys: "Enter / Space",
      action: "Activates the focused Decrease, Increase or Reset button",
    },
  ],
  accessibility: [
    "The wrapper is a `<fieldset>`, so a group, and the field a native number input, both named by `aria-label` or `aria-labelledby`.",
    "A name is required by the type.",
    "The buttons are named Decrease, Increase and Reset; override with `decrementLabel`, `incrementLabel` and `resetLabel`.",
    "A button is disabled at the bound it would cross.",
  ],
  examples: [
    {
      name: "Default",
      render: () => (
        <Stepper
          aria-label="Columns"
          value={4}
          min={1}
          max={8}
          onValueChange={ignore}
          decrementIcon={<IconMinus />}
          incrementIcon={<IconPlus />}
        />
      ),
    },
    {
      name: "At Minimum",
      render: () => (
        <Stepper
          aria-label="Columns"
          value={1}
          min={1}
          max={8}
          onValueChange={ignore}
          decrementIcon={<IconMinus />}
          incrementIcon={<IconPlus />}
        />
      ),
    },
    {
      name: "Reset",
      render: () => (
        <Stepper
          aria-label="Columns"
          value={6}
          min={1}
          max={8}
          fallback={4}
          onValueChange={ignore}
          decrementIcon={<IconMinus />}
          incrementIcon={<IconPlus />}
          resetIcon={<IconArrowRotateAnticlockwise />}
        />
      ),
    },
  ],
};
