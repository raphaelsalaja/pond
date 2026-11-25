import { Loader } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "loader",
  name: "Loader",
  tier: "motion",
  summary:
    "Shows that work is running, with pulsing dots or a spinning ring beside a short status.",
  parts: [
    {
      name: "Loader.Root",
      description:
        "A `status` live region that holds the indicator and its text.",
    },
    { name: "Loader.Dots", description: "Three pulsing dots." },
    {
      name: "Loader.Spinner",
      description:
        "A ring that spins and breathes. Takes its color from the text.",
    },
  ],
  keyboard: [],
  accessibility: [
    '`Root` has `role="status"`, so its text is announced politely when it changes.',
    "`Dots` and `Spinner` are `aria-hidden`. Give `Root` text or an `aria-label`.",
    "Under reduced motion the dots hold still and the ring stops turning.",
  ],
  examples: [
    {
      name: "Dots",
      render: () => (
        <Loader.Root>
          <Loader.Dots />
          Loading library
        </Loader.Root>
      ),
    },
    {
      name: "Spinner",
      render: () => (
        <Loader.Root>
          <Loader.Spinner />
          Syncing sources
        </Loader.Root>
      ),
    },
  ],
};
