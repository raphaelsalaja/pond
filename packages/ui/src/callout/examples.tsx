import type { ComponentDocs } from "../shared/docs";
import { Callout } from ".";

export const docs: ComponentDocs = {
  slug: "callout",
  name: "Callout",
  tier: "content",
  summary:
    "A quiet, dismissible card that sits in a sidebar or panel instead of covering the page.",
  parts: [
    {
      name: "Callout.Root",
      description: "The card. Place it at the end of a sidebar or panel.",
    },
    {
      name: "Callout.Header",
      description: "Lines up the title and the close button.",
    },
    {
      name: "Callout.Title",
      description: "What it's about (`h3`), in title case.",
    },
    {
      name: "Callout.Description",
      description:
        "One or two sentences. A second description adds a smaller detail, like a deadline.",
    },
    {
      name: "Callout.Close",
      description: "Dismisses the card. Named Dismiss unless you pass `aria-label`.",
    },
    {
      name: "Callout.Action",
      description: "One full-width secondary button.",
    },
  ],
  keyboard: [],
  accessibility: [
    "The root is a `section`. Give it `aria-labelledby` when a page has several.",
    "`Close` is an icon button with an accessible name.",
  ],
  examples: [
    {
      name: "Ask",
      render: () => (
        <div style={{ width: 240 }}>
          <Callout.Root>
            <Callout.Header>
              <Callout.Title>Star Pond on GitHub</Callout.Title>
              <Callout.Close />
            </Callout.Header>
            <Callout.Description>
              Pond updates from its GitHub releases. A star there helps more
              people find it.
            </Callout.Description>
            <Callout.Action>Star on GitHub</Callout.Action>
          </Callout.Root>
        </div>
      ),
    },
  ],
};
