import { Wordmark } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "wordmark",
  name: "Wordmark",
  tier: "brand",
  summary: "The Pond mark and name locked up together, scaled from one size.",
  parts: [
    {
      name: "size",
      description:
        "The mark's size in pixels. The name's type scales with it. Defaults to 18.",
    },
  ],
  keyboard: [],
  accessibility: [
    'The mark is `aria-hidden`, so the text "Pond" names the lockup once.',
  ],
  examples: [
    {
      name: "Sizes",
      render: () => (
        <>
          <Wordmark />
          <Wordmark size={32} />
        </>
      ),
    },
  ],
};
