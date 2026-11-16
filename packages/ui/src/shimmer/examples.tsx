import type { ComponentDocs } from "../shared/docs";
import { Shimmer } from ".";

export const docs: ComponentDocs = {
  slug: "shimmer",
  name: "Shimmer",
  tier: "motion",
  summary:
    "Sweeps a highlight across text to show the step that is running now.",
  parts: [
    {
      name: "Shimmer.Root",
      description: "Wraps the text. Paints it with a moving accent gradient.",
    },
  ],
  keyboard: [],
  accessibility: [
    "Renders a plain `<span>`. The text reads normally.",
    "Under reduced motion the sweep stops and the text turns solid accent.",
    "Pair it with a `status` region when the step changes on its own.",
  ],
  examples: [
    {
      name: "Running Step",
      render: () => <Shimmer.Root>Tagging saves</Shimmer.Root>,
    },
  ],
};
