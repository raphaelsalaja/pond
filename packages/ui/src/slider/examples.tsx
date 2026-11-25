import { Slider } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "slider",
  name: "Slider",
  tier: "form",
  summary:
    "Picks a number in a range by dragging a thumb or using the keyboard.",
  parts: [
    {
      name: "Slider.Root",
      description:
        'Holds the value, `min`, `max`, `step` and `largeStep`. `layout="stacked"` puts the label above the track. `layout="field"` puts the label and value inside the control, for rows of sliders.',
    },
    {
      name: "Slider.Label",
      description: "A visible label that names the thumb.",
    },
    { name: "Slider.Control", description: "The interactive area." },
    { name: "Slider.Track", description: "The rail." },
    { name: "Slider.Indicator", description: "The filled part of the rail." },
    {
      name: "Slider.Thumb",
      description:
        "The handle, backed by a native range input. `badge` shows its value underneath.",
    },
    { name: "Slider.Value", description: "Shows the formatted value." },
    {
      name: "Slider.Bounds",
      description: "Labels the `min` and `max` ends under a stacked slider.",
    },
  ],
  keyboard: [
    { keys: "ArrowRight / ArrowUp", action: "Increases by one step" },
    { keys: "ArrowLeft / ArrowDown", action: "Decreases by one step" },
    { keys: "PageUp / PageDown", action: "Moves by a large step" },
    { keys: "Shift + Arrow", action: "Moves by a large step" },
    { keys: "Home / End", action: "Moves to the minimum or maximum" },
  ],
  accessibility: [
    'The thumb is a native `<input type="range">` with `role="slider"`.',
    "Name it with `Slider.Label` or `aria-label` on `Slider.Thumb`.",
  ],
  examples: [
    {
      name: "Default",
      render: () => (
        <Slider.Root defaultValue={40}>
          <Slider.Label>Thumbnail Size</Slider.Label>
          <Slider.Control>
            <Slider.Track>
              <Slider.Indicator />
              <Slider.Thumb />
            </Slider.Track>
          </Slider.Control>
          <Slider.Value />
        </Slider.Root>
      ),
    },
    {
      name: "Stacked",
      render: () => (
        <Slider.Root
          defaultValue={40}
          layout="stacked"
          format={{ style: "unit", unit: "percent" }}
        >
          <Slider.Label>Zoom</Slider.Label>
          <Slider.Control>
            <Slider.Track>
              <Slider.Indicator />
              <Slider.Thumb badge />
            </Slider.Track>
          </Slider.Control>
          <Slider.Bounds min="0%" max="100%" />
        </Slider.Root>
      ),
    },
    {
      name: "Field",
      render: () => (
        <Slider.Root
          defaultValue={60}
          layout="field"
          format={{ style: "unit", unit: "percent" }}
        >
          <Slider.Control>
            <Slider.Track>
              <Slider.Indicator />
              <Slider.Thumb />
            </Slider.Track>
            <Slider.Label>Opacity</Slider.Label>
            <Slider.Value />
          </Slider.Control>
        </Slider.Root>
      ),
    },
    {
      name: "Disabled",
      render: () => (
        <Slider.Root defaultValue={40} disabled>
          <Slider.Control>
            <Slider.Track>
              <Slider.Indicator />
              <Slider.Thumb aria-label="Thumbnail Size" />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      ),
    },
  ],
};
