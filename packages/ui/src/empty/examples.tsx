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
        'Centers its content a little above the middle. `align="start"` left-aligns it. `size="card"` fits a pane, popover or dialog. `size="inline"` fits a row or tile and drops the media.',
    },
    {
      name: "Empty.Media",
      description:
        "The place's icon, drawn large and faint above the title. Pass a 14px icon or a `Loader.Spinner`.",
    },
    {
      name: "Empty.Title",
      description:
        "What's missing (`h2`), like No saves yet. Five words max, no period.",
    },
    {
      name: "Empty.Description",
      description:
        "One sentence on what makes it appear. Never repeats the title.",
    },
    {
      name: "Empty.Action",
      description:
        'One primary action. A second path is a `variant="text"` button. Leave it out when the place is done.',
    },
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
            <IconTrash size={14} />
          </Empty.Media>
          <Empty.Title>Trash is empty</Empty.Title>
          <Empty.Description>Saves you delete show up here.</Empty.Description>
        </Empty.Root>
      ),
    },
    {
      name: "Card",
      render: () => (
        <Empty.Root size="card">
          <Empty.Media>
            <IconInbox size={14} />
          </Empty.Media>
          <Empty.Title>You're all caught up</Empty.Title>
          <Empty.Description>
            New saves wait here until you process them.
          </Empty.Description>
        </Empty.Root>
      ),
    },
    {
      name: "Inline",
      render: () => (
        <Empty.Root size="inline">
          <Empty.Title>No notifications</Empty.Title>
        </Empty.Root>
      ),
    },
    {
      name: "Action",
      render: () => (
        <Empty.Root>
          <Empty.Media>
            <IconInbox size={14} />
          </Empty.Media>
          <Empty.Title>No saves yet</Empty.Title>
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
