import { Badge } from "../badge";
import type { ComponentDocs } from "../shared/docs";
import { Reveal } from ".";

export const docs: ComponentDocs = {
  slug: "reveal",
  name: "Reveal",
  tier: "motion",
  summary:
    "Grows content in and out by height, or by width when you pass one, as it mounts and unmounts.",
  parts: [
    {
      name: "visible",
      description:
        "Mounts the content and grows it in. `false` shrinks it out and unmounts it.",
    },
    {
      name: "width",
      description: "Animates width to this many pixels instead of height.",
    },
    {
      name: "initial",
      description:
        "`false` skips the entrance on first render, for content that is already there.",
    },
    { name: "className", description: "Lands on the clipping wrapper." },
  ],
  keyboard: [],
  accessibility: [
    "Adds no roles. Hidden content is unmounted, so it leaves the tab order and the accessibility tree.",
    "Under reduced motion, or while the page is hidden, content appears and disappears without animating.",
  ],
  examples: [
    {
      name: "Height",
      render: () => (
        <Reveal initial={false}>
          <p>Koi tagged 12 saves in Design.</p>
        </Reveal>
      ),
    },
    {
      name: "Width",
      render: () => (
        <Reveal initial={false} width={72}>
          <Badge tone="accent">Synced</Badge>
        </Reveal>
      ),
    },
  ],
};
