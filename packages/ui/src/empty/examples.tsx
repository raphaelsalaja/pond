import { IconInbox, IconTrash } from "@pond/icons";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { Empty } from ".";

export const docs: ComponentDocs = {
  slug: "empty",
  name: "Empty",
  tier: "content",
  summary:
    "Fills a place that has nothing in it yet, and says what to do next.",
  parts: [
    {
      name: "Empty.Root",
      description:
        'Centers its content a little above the middle. `align="start"` left-aligns it.',
    },
    { name: "Empty.Media", description: "A decorative icon above the title." },
    {
      name: "Empty.Title",
      description: "The place name (`h2`), like Library or Trash.",
    },
    {
      name: "Empty.Description",
      description: "One sentence on what shows up here or how to fill it.",
    },
    { name: "Empty.Action", description: "A row for one or two buttons." },
  ],
  keyboard: [],
  accessibility: [
    "`Media` is `aria-hidden`.",
    "The title is an `h2`. Keep it in order with the headings around it.",
    "The entrance animation turns off under reduced motion.",
  ],
  examples: [
    {
      name: "Place",
      render: () => (
        <Empty.Root>
          <Empty.Media>
            <IconTrash />
          </Empty.Media>
          <Empty.Title>Trash</Empty.Title>
          <Empty.Description>Saves you delete show up here.</Empty.Description>
        </Empty.Root>
      ),
    },
    {
      name: "Action",
      render: () => (
        <Empty.Root>
          <Empty.Media>
            <IconInbox />
          </Empty.Media>
          <Empty.Title>Library</Empty.Title>
          <Empty.Description>
            Add a source to start collecting saves.
          </Empty.Description>
          <Empty.Action>
            <Button variant="primary">New Source</Button>
          </Empty.Action>
        </Empty.Root>
      ),
    },
  ],
};
