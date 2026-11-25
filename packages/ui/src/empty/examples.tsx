import { IconTrash } from "@pond/icons";
import { Empty, EmptyPreview } from ".";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";

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
        "A faint preview of what will land here, drawn with `EmptyPreview`, or a `Loader.Spinner` while loading.",
    },
    {
      name: "EmptyPreview.Root",
      description:
        'Ghost cards shaped like the thing that fills the place. `kind` picks `row`, `tile`, `chip`, `panel`, `field` or `board`. `layout` picks `stack`, `single`, `spread` or `list`. Shrinks inside `size="card"`.',
    },
    {
      name: "EmptyPreview.Row, Column, Line, Lines, Space, Thumb, Block, Icon, Chips",
      description:
        "The content of each card. Put a 12px icon in `Icon` or `Block` to name the place.",
    },
    {
      name: "Empty.Title",
      description:
        "What's missing (`h2`), like No Saves Yet. Title case, five words max, no period.",
    },
    {
      name: "Empty.Description",
      description:
        "One sentence on what makes it appear. Never repeats the title.",
    },
    {
      name: "Empty.Action",
      description:
        'One `variant="secondary"` button, a verb plus noun. A second path is a `variant="text"` button. Leave it out when the place is done.',
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
            <EmptyPreview.Root kind="tile" layout="single">
              <EmptyPreview.Column>
                <EmptyPreview.Block>
                  <IconTrash size={12} />
                </EmptyPreview.Block>
                <EmptyPreview.Line width={32} />
              </EmptyPreview.Column>
            </EmptyPreview.Root>
          </Empty.Media>
          <Empty.Title>Trash Is Empty</Empty.Title>
          <Empty.Description>Saves you delete show up here.</Empty.Description>
        </Empty.Root>
      ),
    },
    {
      name: "Card",
      render: () => (
        <Empty.Root size="card">
          <Empty.Media>
            <EmptyPreview.Root kind="panel">
              <EmptyPreview.Column>
                <EmptyPreview.Block />
                <EmptyPreview.Line width={52} />
                <EmptyPreview.Line width={34} tone="thin" />
              </EmptyPreview.Column>
            </EmptyPreview.Root>
          </Empty.Media>
          <Empty.Title>You&apos;re All Caught Up</Empty.Title>
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
          <Empty.Title>No Notifications</Empty.Title>
        </Empty.Root>
      ),
    },
    {
      name: "Action",
      render: () => (
        <Empty.Root>
          <Empty.Media>
            <EmptyPreview.Root kind="tile" layout="spread">
              <EmptyPreview.Column>
                <EmptyPreview.Block />
                <EmptyPreview.Line width={36} />
                <EmptyPreview.Line width={24} tone="thin" />
              </EmptyPreview.Column>
            </EmptyPreview.Root>
          </Empty.Media>
          <Empty.Title>No Saves Yet</Empty.Title>
          <Empty.Description>
            Add a source to start collecting saves.
          </Empty.Description>
          <Empty.Action>
            <Button variant="secondary" size="sm">
              New Source
            </Button>
          </Empty.Action>
        </Empty.Root>
      ),
    },
  ],
};
