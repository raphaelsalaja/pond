import { Button, Menu } from "@pond/ui";
import { Cell } from "./cell";

export default function DropdownCell() {
  return (
    <Cell label="Dropdown">
      <Menu.Root>
        <Menu.Trigger render={<Button size="sm">Open menu</Button>} />
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item>
                <Menu.ItemLabel>Profile</Menu.ItemLabel>
                <Menu.ItemKbd>⌘P</Menu.ItemKbd>
              </Menu.Item>
              <Menu.Item>
                <Menu.ItemLabel>Settings</Menu.ItemLabel>
                <Menu.ItemKbd>⌘,</Menu.ItemKbd>
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item>
                <Menu.ItemLabel>Sign out</Menu.ItemLabel>
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </Cell>
  );
}
