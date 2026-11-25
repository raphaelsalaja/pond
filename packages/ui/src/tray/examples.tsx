import {
  IconArrowDown,
  IconArrowUp,
  IconArrowUpRight,
  IconCrop,
  IconPencil,
  IconShare,
  IconTrash,
} from "@pond/icons";
import { Tray } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "tray",
  name: "Tray",
  tier: "composite",
  summary:
    "A floating pill of icon actions with one tab stop and arrow keys between its items.",
  parts: [
    {
      name: "Tray.Pill",
      description:
        "The surface, and the toolbar once it holds items. `orientation` is horizontal or vertical. Name it with `aria-label`.",
    },
    {
      name: "Tray.Item",
      description:
        "An icon action that joins the roving focus. Place it inside a pill. Requires `aria-label`. Disabled items stay focusable.",
    },
    {
      name: "Tray.Indicator",
      description: "A fill behind the active item. Place it inside the item.",
    },
    {
      name: "Tray.Separator",
      description: "A line between groups of items, turned to fit the pill.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Moves focus into the pill, then out of it" },
    {
      keys: "ArrowRight / ArrowLeft",
      action: "Moves between items in a horizontal pill, wrapping at the ends",
    },
    {
      keys: "ArrowDown / ArrowUp",
      action: "Moves between items in a vertical pill, wrapping at the ends",
    },
    { keys: "Home / End", action: "Moves to the first or last item" },
    { keys: "Enter / Space", action: "Activates the focused item" },
  ],
  accessibility: [
    'A pill that holds a `Tray.Item` renders `role="toolbar"` with `aria-orientation` through Base UI Toolbar.',
    "A pill of other controls stays a plain surface, so it can sit inside a host toolbar without nesting one.",
    "Only `Tray.Item` joins the roving focus. Other controls inside the pill keep their own tab stop.",
    "Give each pill an `aria-label` when a screen shows more than one.",
    'Mark a toggled item with `aria-pressed` and `data-status="active"`.',
    "Color and icon transitions turn off under reduced motion.",
  ],
  examples: [
    {
      name: "Actions",
      render: () => (
        <Tray.Pill aria-label="Save Actions">
          <Tray.Item aria-label="Previous Save">
            <IconArrowUp />
          </Tray.Item>
          <Tray.Item aria-label="Next Save">
            <IconArrowDown />
          </Tray.Item>
          <Tray.Separator />
          <Tray.Item aria-label="Open Original">
            <IconArrowUpRight />
          </Tray.Item>
          <Tray.Item aria-label="Share">
            <IconShare />
          </Tray.Item>
        </Tray.Pill>
      ),
    },
    {
      name: "Active Item",
      render: () => (
        <Tray.Pill aria-label="Edit Tools">
          <Tray.Item aria-label="Crop" aria-pressed data-status="active">
            <Tray.Indicator />
            <IconCrop />
          </Tray.Item>
          <Tray.Item aria-label="Markup" aria-pressed={false}>
            <IconPencil />
          </Tray.Item>
        </Tray.Pill>
      ),
    },
    {
      name: "Vertical",
      render: () => (
        <Tray.Pill aria-label="Save Navigation" orientation="vertical">
          <Tray.Item aria-label="Previous Save">
            <IconArrowUp />
          </Tray.Item>
          <Tray.Separator />
          <Tray.Item aria-label="Next Save">
            <IconArrowDown />
          </Tray.Item>
        </Tray.Pill>
      ),
    },
    {
      name: "Disabled Item",
      render: () => (
        <Tray.Pill aria-label="Save Actions">
          <Tray.Item aria-label="Share">
            <IconShare />
          </Tray.Item>
          <Tray.Item aria-label="Move to Trash" disabled>
            <IconTrash />
          </Tray.Item>
        </Tray.Pill>
      ),
    },
  ],
};
