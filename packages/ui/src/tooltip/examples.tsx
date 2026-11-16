import { IconFolderPlus, IconTrash } from "@pond/icons";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { Tooltip } from ".";

export const docs: ComponentDocs = {
  slug: "tooltip",
  name: "Tooltip",
  tier: "overlay",
  summary:
    "Shows a short hint, and an optional shortcut, when a control is hovered or focused.",
  parts: [
    {
      name: "Tooltip",
      description:
        "Call it with `label` and one child element to wrap a control in a tooltip.",
    },
    {
      name: "Tooltip.Group",
      description:
        "Shares one popup across neighboring tooltips so it travels between them.",
    },
    {
      name: "Tooltip.Info",
      description: "A small info button that explains the title beside it.",
    },
    {
      name: "Tooltip.Root",
      description: "Holds open state for a hand-built tooltip.",
    },
    {
      name: "Tooltip.Trigger",
      description:
        "The control the tooltip describes. Use `render` to pass a Pond `Button`.",
    },
    {
      name: "Tooltip.Portal",
      description: "Moves the popup to the end of the document.",
    },
    {
      name: "Tooltip.Positioner",
      description: "Places the popup beside the trigger.",
    },
    { name: "Tooltip.Popup", description: "The floating hint." },
    {
      name: "Tooltip.Provider",
      description: "Shares open delays across tooltips.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Focusing the trigger shows the tooltip" },
    {
      keys: "Escape",
      action: "Hides the tooltip and keeps focus on the trigger",
    },
  ],
  accessibility: [
    "The popup is visual only. Base UI does not link it to the trigger, so screen readers don't announce it.",
    "Name every icon button with its own `aria-label`. The tooltip never supplies the accessible name.",
    "Opens on keyboard focus as well as hover, and closes with Escape.",
    "Enter and exit transitions drop movement under reduced motion.",
  ],
  examples: [
    {
      name: "Callable",
      render: () => (
        <Tooltip label="New Folder" shortcut="⌘N">
          <Button icon variant="ghost" aria-label="New Folder">
            <IconFolderPlus />
          </Button>
        </Tooltip>
      ),
    },
    {
      name: "Compound",
      render: () => (
        <Tooltip.Root>
          <Tooltip.Trigger
            render={<Button icon variant="ghost" aria-label="Move to Trash" />}
          >
            <IconTrash />
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom">
              <Tooltip.Popup>{Tooltip.Label("Move to Trash")}</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      ),
    },
    {
      name: "Group",
      render: () => (
        <Tooltip.Group>
          <Tooltip label="New Folder">
            <Button icon variant="ghost" aria-label="New Folder">
              <IconFolderPlus />
            </Button>
          </Tooltip>
          <Tooltip label="Move to Trash">
            <Button icon variant="ghost" aria-label="Move to Trash">
              <IconTrash />
            </Button>
          </Tooltip>
        </Tooltip.Group>
      ),
    },
    {
      name: "Info",
      render: () => (
        <Tooltip.Info label="Pond checks each source every hour." />
      ),
    },
  ],
};
