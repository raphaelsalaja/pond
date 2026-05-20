import { Button, Popover } from "@pond/ui";
import { Cell } from "./cell";

export default function PopoverCell() {
  return (
    <Cell label="Popover">
      <Popover.Root>
        <Popover.Trigger render={<Button size="sm">Open popover</Button>} />
        <Popover.Content>
          <div style={{ padding: 12, maxWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 550, marginBottom: 4 }}>
              Popover
            </div>
            <div style={{ fontSize: 12, color: "var(--ds-gray-11)" }}>
              Free-form content anchored to the trigger.
            </div>
          </div>
        </Popover.Content>
      </Popover.Root>
    </Cell>
  );
}
