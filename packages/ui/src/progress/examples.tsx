import type { ComponentDocs } from "../shared/docs";
import { Progress } from ".";

export const docs: ComponentDocs = {
  slug: "progress",
  name: "Progress",
  tier: "motion",
  summary:
    "Shows how far a long task has gone, or sweeps while the amount is unknown.",
  parts: [
    {
      name: "Progress.Root",
      description:
        "A `progressbar` that takes `value` from 0 to `max`. Pass `null` while the amount is unknown. `size` is `sm` (4px) or `md` (8px).",
    },
    { name: "Progress.Track", description: "The rail behind the fill." },
    {
      name: "Progress.Indicator",
      description: "The fill. Sweeps across the track when `value` is `null`.",
    },
    {
      name: "Progress.Label",
      description: "Names the bar for assistive tech and shows it on screen.",
    },
    { name: "Progress.Value", description: "The formatted value as text." },
  ],
  keyboard: [],
  accessibility: [
    "`Root` sets `aria-valuenow`, `aria-valuemin` and `aria-valuemax`, and drops `aria-valuenow` while the value is unknown.",
    "Name the bar with `Label` or an `aria-label` on `Root`.",
    "Under reduced motion the unknown state holds still as a dim, full track.",
  ],
  examples: [
    {
      name: "Determinate",
      render: () => (
        <Progress.Root value={46} style={{ width: 240 }}>
          <Progress.Track>
            <Progress.Indicator />
          </Progress.Track>
          <Progress.Label>Downloading update</Progress.Label>
        </Progress.Root>
      ),
    },
    {
      name: "Indeterminate",
      render: () => (
        <Progress.Root value={null} style={{ width: 240 }}>
          <Progress.Track>
            <Progress.Indicator />
          </Progress.Track>
          <Progress.Label>Checking for updates</Progress.Label>
        </Progress.Root>
      ),
    },
    {
      name: "Medium",
      render: () => (
        <Progress.Root size="md" value={72} style={{ width: 240 }}>
          <Progress.Track>
            <Progress.Indicator />
          </Progress.Track>
          <Progress.Label>72%</Progress.Label>
        </Progress.Root>
      ),
    },
  ],
};
