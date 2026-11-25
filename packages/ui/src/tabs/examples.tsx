import { IconGrid, IconGridLayoutRows } from "@pond/icons";
import { Tabs } from ".";
import type { ComponentDocs } from "../shared/docs";

export const docs: ComponentDocs = {
  slug: "tabs",
  name: "Tabs",
  tier: "navigation",
  summary:
    "Switches between views that share one place, like the panels of a fish profile.",
  parts: [
    {
      name: "Tabs.Root",
      description:
        "Holds the selected `value`. Starts from `defaultValue` or stays controlled.",
    },
    {
      name: "Tabs.List",
      description: "The `tablist`. Name it with `aria-label`.",
    },
    {
      name: "Tabs.Tab",
      description:
        "One tab, keyed by `value`. `icon` makes it a square icon-only tab that needs an `aria-label`.",
    },
    {
      name: "Tabs.Panel",
      description: "The content for the tab with the same `value`.",
    },
    {
      name: "Tabs.Indicator",
      description:
        "An optional element that tracks the selected tab for a sliding highlight.",
    },
  ],
  keyboard: [
    {
      keys: "Tab",
      action: "Moves focus to the selected tab, then into its panel",
    },
    {
      keys: "Left / Right",
      action: "Moves focus to the previous or next tab, wrapping at the ends",
    },
    { keys: "Home / End", action: "Moves focus to the first or last tab" },
    { keys: "Enter / Space", action: "Selects the focused tab" },
  ],
  accessibility: [
    "Follows the WAI-ARIA tabs pattern through Base UI: `tablist`, `tab` with `aria-selected`, and `tabpanel`.",
    "The list has one tab stop. Arrows move focus without changing the selected tab.",
    "Each panel is labelled by its tab.",
  ],
  examples: [
    {
      name: "Text",
      render: () => (
        <Tabs.Root defaultValue="details">
          <Tabs.List aria-label="Fish Views">
            <Tabs.Tab value="details">Details</Tabs.Tab>
            <Tabs.Tab value="library">Library</Tabs.Tab>
            <Tabs.Tab value="activity">Activity</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="details">Koi tags new saves in Design.</Tabs.Panel>
          <Tabs.Panel value="library">128 saves</Tabs.Panel>
          <Tabs.Panel value="activity">No runs yet</Tabs.Panel>
        </Tabs.Root>
      ),
    },
    {
      name: "Icon",
      render: () => (
        <Tabs.Root defaultValue="grid">
          <Tabs.List aria-label="Layout">
            <Tabs.Tab value="grid" icon aria-label="Grid">
              <IconGrid size={14} />
            </Tabs.Tab>
            <Tabs.Tab value="list" icon aria-label="List">
              <IconGridLayoutRows size={14} />
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="grid">Grid of saves</Tabs.Panel>
          <Tabs.Panel value="list">List of saves</Tabs.Panel>
        </Tabs.Root>
      ),
    },
  ],
};
