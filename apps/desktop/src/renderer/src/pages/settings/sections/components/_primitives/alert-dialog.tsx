import { AlertDialog, Button } from "@pond/ui";
import { Cell } from "./cell";

export default function AlertDialogCell() {
  return (
    <Cell label="Alert Dialog">
      <AlertDialog.Root>
        <AlertDialog.Trigger
          render={
            <Button size="sm" variant="danger">
              Delete…
            </Button>
          }
        />
        <AlertDialog.Content>
          <AlertDialog.Title>Are you sure?</AlertDialog.Title>
          <AlertDialog.Description>
            This action can't be undone. The item will be moved to the trash.
          </AlertDialog.Description>
          <AlertDialog.Actions>
            <AlertDialog.Close
              render={
                <Button size="sm" variant="ghost">
                  Cancel
                </Button>
              }
            />
            <AlertDialog.Close
              render={
                <Button size="sm" variant="danger">
                  Delete
                </Button>
              }
            />
          </AlertDialog.Actions>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Cell>
  );
}
