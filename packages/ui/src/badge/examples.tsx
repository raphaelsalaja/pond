import type { ComponentDocs } from "../shared/docs";
import { Badge } from ".";

export const docs: ComponentDocs = {
  slug: "badge",
  name: "Badge",
  tier: "content",
  summary:
    "Labels a status in a short pill. Use `Chip` when it needs to be clicked.",
  parts: [
    {
      name: "Badge",
      description: "The pill. Callable directly or as `Badge.Root`.",
    },
    { name: "Badge.Dot", description: "A small status dot without text." },
    {
      name: "tone",
      description: "neutral, positive, inverted, negative or accent",
    },
  ],
  keyboard: [],
  accessibility: [
    "Renders a plain `<span>`. The text is the status, so tone is never the only signal.",
    "`Dot` is `aria-hidden`. Put a text label beside it.",
  ],
  examples: [
    {
      name: "Tones",
      render: () => (
        <>
          <Badge>Paused</Badge>
          <Badge tone="inverted">Downloading</Badge>
          <Badge tone="negative">Failed</Badge>
          <Badge tone="accent">New</Badge>
        </>
      ),
    },
    {
      name: "Dot",
      render: () => (
        <>
          <Badge.Dot tone="accent" />
          <span>Synced</span>
          <Badge.Dot tone="negative" />
          <span>Sign in again</span>
        </>
      ),
    },
  ],
};
