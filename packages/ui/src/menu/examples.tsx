import { IconCopy, IconDots, IconPencil, IconTrash } from "@pond/icons";
import { useState } from "react";
import type { ComponentDocs } from "../shared/docs";
import { Menu } from ".";

function SaveActions() {
  return (
    <Menu.Root>
      <Menu.Trigger icon variant="ghost" aria-label="Save Actions">
        <IconDots />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup>
            <Menu.Item>
              <Menu.ItemIcon>
                <IconPencil size={12} />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Rename</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Item>
              <Menu.ItemIcon>
                <IconCopy size={12} />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Duplicate</Menu.ItemLabel>
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item variant="destructive">
              <Menu.ItemIcon>
                <IconTrash size={12} />
              </Menu.ItemIcon>
              <Menu.ItemLabel>Move to Trash</Menu.ItemLabel>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function SortSaves() {
  const [order, setOrder] = useState("newest");
  return (
    <Menu.Root>
      <Menu.Trigger>Sort</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup>
            <Menu.RadioGroup
              value={order}
              onValueChange={(value) => setOrder(String(value))}
            >
              <Menu.RadioItem value="newest">
                <Menu.ItemLabel>Newest First</Menu.ItemLabel>
              </Menu.RadioItem>
              <Menu.RadioItem value="oldest">
                <Menu.ItemLabel>Oldest First</Menu.ItemLabel>
              </Menu.RadioItem>
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

function FolderMenu() {
  return (
    <Menu.Root>
      <Menu.Trigger variant="tertiary">Folder</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup>
            <Menu.Items
              items={[
                { label: "New Folder", shortcut: ["⌘", "N"] },
                { type: "separator" },
                {
                  type: "submenu",
                  label: "Move To",
                  items: [{ label: "Inspiration" }, { label: "Reading List" }],
                },
              ]}
            />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "menu",
  name: "Menu",
  tier: "overlay",
  summary: "Lists actions or options behind a trigger button.",
  parts: [
    {
      name: "Menu.Root",
      description: "Holds open state and the highlighted item.",
    },
    {
      name: "Menu.Trigger",
      description:
        "Opens the menu. Renders a Pond `Button` and takes its `variant`, `size` and `icon`.",
    },
    {
      name: "Menu.Portal",
      description: "Moves the menu to the end of the document.",
    },
    {
      name: "Menu.Positioner",
      description: "Places the popup beside the trigger.",
    },
    {
      name: "Menu.Popup",
      description: 'The floating list with `role="menu"`.',
    },
    {
      name: "Menu.Item",
      description:
        'An action row. `variant="destructive"` marks a risky action.',
    },
    {
      name: "Menu.ItemIcon",
      description: "Leading icon, hidden from assistive tech.",
    },
    { name: "Menu.ItemLabel", description: "The row's text." },
    { name: "Menu.ItemKeyboard", description: "Trailing keyboard shortcut." },
    { name: "Menu.Separator", description: "Divides groups of items." },
    {
      name: "Menu.Group",
      description: "Groups items under a `Menu.GroupLabel`.",
    },
    {
      name: "Menu.RadioGroup",
      description: "One choice among `Menu.RadioItem` rows.",
    },
    { name: "Menu.CheckboxItem", description: "A row that toggles on or off." },
    {
      name: "Menu.SubmenuRoot",
      description: "Nests a menu under a `Menu.SubmenuTrigger` row.",
    },
    {
      name: "Menu.Items",
      description: "Renders a menu from a `MenuItemSpec` array.",
    },
  ],
  keyboard: [
    { keys: "Enter", action: "Opens the menu and highlights the first item" },
    { keys: "Space", action: "Opens the menu and highlights the first item" },
    { keys: "ArrowDown", action: "Opens the menu, or moves to the next item" },
    { keys: "ArrowUp", action: "Moves to the previous item" },
    { keys: "Home", action: "Moves to the first item" },
    { keys: "End", action: "Moves to the last item" },
    { keys: "ArrowRight", action: "Opens a submenu" },
    { keys: "ArrowLeft", action: "Closes a submenu" },
    {
      keys: "A to Z",
      action: "Moves to the next item starting with that letter",
    },
    {
      keys: "Escape",
      action: "Closes the menu and returns focus to the trigger",
    },
  ],
  accessibility: [
    'The trigger sets `aria-haspopup="menu"` and `aria-expanded`. The popup has `role="menu"`.',
    "Items are `menuitem`, `menuitemradio` or `menuitemcheckbox` with roving focus.",
    "Icon triggers need an `aria-label`.",
    "Open and close transitions drop movement under reduced motion.",
  ],
  examples: [
    { name: "Icon Trigger", render: () => <SaveActions /> },
    { name: "Radio Items", render: () => <SortSaves /> },
    { name: "From Items", render: () => <FolderMenu /> },
  ],
};
