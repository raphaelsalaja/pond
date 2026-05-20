import { Button, Dialog } from "@pond/ui";
import { Cell } from "./cell";

export default function DialogCell() {
  return (
    <Cell label="Dialog">
      <Dialog.Root>
        <Dialog.Trigger render={<Button size="sm">Click me!</Button>} />
        <Dialog.Content>
          <Dialog.Title>Sample dialog</Dialog.Title>
          <Dialog.Description>
            Dialogs trap focus and dim the rest of the app while open.
          </Dialog.Description>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Dialog.Close render={<Button size="sm">Close</Button>} />
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </Cell>
  );
}
