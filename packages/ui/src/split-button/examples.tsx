import { IconBarsFilter } from "@pond/icons";
import { SplitButton } from ".";
import { Menu } from "../menu";
import type { ComponentDocs } from "../shared/docs";

function SaveMenu() {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={<SplitButton.Trigger aria-label="More Save Options" />}
      />
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end">
          <Menu.Popup>
            <Menu.Item>
              <Menu.ItemLabel>Save</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item>
              <Menu.ItemLabel>Save and Close</Menu.ItemLabel>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "split-button",
  name: "Split Button",
  tier: "form",
  summary:
    "Runs the default action, with a joined trigger beside it that opens the alternatives.",
  parts: [
    {
      name: "SplitButton.Root",
      description:
        "Joins both segments into one `group`. `variant` is primary or secondary; `size` is xs to md.",
    },
    {
      name: "SplitButton.Action",
      description:
        "The default action. A Button in the root's variant and size.",
    },
    {
      name: "SplitButton.Trigger",
      description:
        "Opens the alternatives. Pass it to a `Menu.Trigger` through `render`. Shows a chevron unless given an icon. Requires `aria-label`.",
    },
  ],
  keyboard: [
    { keys: "Tab", action: "Moves between the action and the trigger" },
    { keys: "Enter", action: "Activates the focused segment" },
    { keys: "Space", action: "Activates the focused segment" },
  ],
  accessibility: [
    "Each segment is a native `<button>` with its own accessible name.",
    "Name the trigger for the set it opens, like `More Save Options`.",
    "Repeat the default action as the first menu item so the menu holds every option.",
  ],
  examples: [
    {
      name: "Primary",
      render: () => (
        <SplitButton.Root aria-label="Save">
          <SplitButton.Action>Save</SplitButton.Action>
          <SaveMenu />
        </SplitButton.Root>
      ),
    },
    {
      name: "Secondary",
      render: () => (
        <SplitButton.Root variant="secondary" aria-label="Save">
          <SplitButton.Action>Save</SplitButton.Action>
          <SaveMenu />
        </SplitButton.Root>
      ),
    },
    {
      name: "Sizes",
      render: () => (
        <>
          {(["xs", "sm", "md"] as const).map((size) => (
            <SplitButton.Root
              key={size}
              variant="secondary"
              size={size}
              aria-label="Save"
            >
              <SplitButton.Action>Save</SplitButton.Action>
              <SaveMenu />
            </SplitButton.Root>
          ))}
        </>
      ),
    },
    {
      name: "Icon Trigger",
      render: () => (
        <SplitButton.Root variant="secondary" size="sm" aria-label="Filters">
          <SplitButton.Action>2 Filters</SplitButton.Action>
          <SplitButton.Trigger aria-label="Add Filter">
            <IconBarsFilter />
          </SplitButton.Trigger>
        </SplitButton.Root>
      ),
    },
  ],
};
