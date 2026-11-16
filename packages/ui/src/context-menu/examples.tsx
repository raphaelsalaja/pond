import { IconCopy, IconPencil, IconTrash } from "@pond/icons";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { ContextMenu } from ".";

function FolderActions() {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<Button variant="secondary" />}>
        Inspiration
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner>
          <ContextMenu.Popup>
            <ContextMenu.Item>
              <ContextMenu.ItemIcon>
                <IconPencil size={12} />
              </ContextMenu.ItemIcon>
              <ContextMenu.ItemLabel>Rename</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Item>
              <ContextMenu.ItemIcon>
                <IconCopy size={12} />
              </ContextMenu.ItemIcon>
              <ContextMenu.ItemLabel>Duplicate</ContextMenu.ItemLabel>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item>
              <ContextMenu.ItemIcon>
                <IconTrash size={12} />
              </ContextMenu.ItemIcon>
              <ContextMenu.ItemLabel>Move to Trash</ContextMenu.ItemLabel>
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SaveActions() {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger render={<Button variant="tertiary" />}>
        Reading List
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner>
          <ContextMenu.Popup>
            <ContextMenu.Items
              items={[
                { label: "Open", shortcut: ["⌘", "O"] },
                { label: "Copy Link", shortcut: ["⌘", "C"] },
                { type: "separator" },
                {
                  type: "submenu",
                  label: "Add to Folder",
                  items: [{ label: "Inspiration" }, { label: "Recipes" }],
                },
              ]}
            />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export const docs: ComponentDocs = {
  slug: "context-menu",
  name: "Context Menu",
  tier: "overlay",
  summary:
    "Lists actions for a save, folder or other surface when you right-click it.",
  parts: [
    {
      name: "ContextMenu.Root",
      description: "Holds open state and the highlighted item.",
    },
    {
      name: "ContextMenu.Trigger",
      description:
        "The area that opens the menu on right-click. Render a focusable element.",
    },
    {
      name: "ContextMenu.Portal",
      description: "Moves the menu to the end of the document.",
    },
    {
      name: "ContextMenu.Positioner",
      description: "Places the popup at the pointer.",
    },
    {
      name: "ContextMenu.Popup",
      description: 'The floating list with `role="menu"`.',
    },
    { name: "ContextMenu.Item", description: "An action row." },
    {
      name: "ContextMenu.ItemIcon",
      description: "Leading icon, hidden from assistive tech.",
    },
    { name: "ContextMenu.ItemLabel", description: "The row's text." },
    {
      name: "ContextMenu.ItemKeyboard",
      description: "Trailing keyboard shortcut.",
    },
    { name: "ContextMenu.Separator", description: "Divides groups of items." },
    {
      name: "ContextMenu.CheckboxItem",
      description: "A row that toggles on or off.",
    },
    {
      name: "ContextMenu.SubmenuRoot",
      description: "Nests a menu under a `ContextMenu.SubmenuTrigger` row.",
    },
    {
      name: "ContextMenu.Items",
      description: "Renders a menu from a `MenuItemSpec` array.",
    },
  ],
  keyboard: [
    {
      keys: "Shift+F10",
      action:
        "Opens the menu on the focused trigger in Windows and Linux builds",
    },
    {
      keys: "ContextMenu",
      action:
        "Opens the menu on the focused trigger in Windows and Linux builds",
    },
    { keys: "ArrowDown", action: "Moves to the next item" },
    { keys: "ArrowUp", action: "Moves to the previous item" },
    { keys: "ArrowRight", action: "Opens a submenu" },
    { keys: "ArrowLeft", action: "Closes a submenu" },
    { keys: "Enter", action: "Runs the highlighted item" },
    { keys: "Escape", action: "Closes the menu" },
  ],
  accessibility: [
    "Opens on the browser's `contextmenu` event, so the keyboard shortcuts come from the platform, not Base UI.",
    "On macOS there is no keyboard path, so put every action in a reachable `Menu` or toolbar too.",
    'The popup has `role="menu"` and its rows are `menuitem` with roving focus.',
    "Open and close transitions drop movement under reduced motion.",
  ],
  examples: [
    { name: "Folder", render: () => <FolderActions /> },
    { name: "From Items", render: () => <SaveActions /> },
  ],
};
