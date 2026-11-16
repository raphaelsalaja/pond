import { useRef } from "react";
import { Button } from "../button";
import type { ComponentDocs } from "../shared/docs";
import { Dialog } from ".";

function RenameFolder() {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={<Button variant="secondary" />}>
        Rename Folder
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>Rename Folder</Dialog.Title>
            <Dialog.Close />
          </Dialog.Header>
          <Dialog.Content>
            <Dialog.Description>
              Saves keep their tags when the folder moves.
            </Dialog.Description>
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel />
            <Dialog.Confirm>Rename</Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteFolder() {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root variant="alert">
      <Dialog.Trigger render={<Button variant="destructive" />}>
        Delete Folder
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup initialFocus={cancel}>
          <Dialog.Header>
            <Dialog.Title>Delete Folder</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content>
            <Dialog.Description>
              Saves in this folder move to Trash.
            </Dialog.Description>
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel ref={cancel} />
            <Dialog.Confirm variant="destructive">Delete</Dialog.Confirm>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EmptyTrash() {
  return (
    <>
      <Dialog.Host />
      <Button
        variant="secondary"
        onClick={() =>
          Dialog.confirm({
            title: "Empty Trash",
            description: "Every save in Trash is deleted for good.",
            confirmLabel: "Empty Trash",
            onConfirm: () => {},
          })
        }
      >
        Empty Trash
      </Button>
    </>
  );
}

export const docs: ComponentDocs = {
  slug: "dialog",
  name: "Dialog",
  tier: "overlay",
  summary: "Asks for a decision or input in a modal window over the app.",
  parts: [
    {
      name: "Dialog.Root",
      description:
        'Holds open state. `variant="alert"` makes it an alert dialog.',
    },
    {
      name: "Dialog.Trigger",
      description: "The button that opens the dialog. Render a Pond `Button`.",
    },
    {
      name: "Dialog.Portal",
      description: "Moves the dialog to the end of the document.",
    },
    { name: "Dialog.Backdrop", description: "Dims the app behind the dialog." },
    {
      name: "Dialog.Popup",
      description:
        "The modal window. Pass `pageId` and `depth` for stepped flows.",
    },
    {
      name: "Dialog.Header",
      description: "Top row for the title and header actions.",
    },
    {
      name: "Dialog.Title",
      description: "Names the dialog through `aria-labelledby`.",
    },
    {
      name: "Dialog.Description",
      description: "Describes the dialog through `aria-describedby`.",
    },
    { name: "Dialog.Content", description: "Scrolling body." },
    {
      name: "Dialog.Viewport",
      description: "Animates between pages of a stepped dialog.",
    },
    {
      name: "Dialog.Back",
      description: "Header button that goes to the previous page.",
    },
    {
      name: "Dialog.Close",
      description: "Header button that closes the dialog.",
    },
    {
      name: "Dialog.Footer",
      description: "Bottom row for actions, with an optional `leading` slot.",
    },
    {
      name: "Dialog.Cancel",
      description: "Secondary button that closes the dialog.",
    },
    { name: "Dialog.Confirm", description: "Primary action button." },
    {
      name: "Dialog.confirm",
      description:
        "Opens a shared alert dialog. Needs `Dialog.Host` mounted once.",
    },
    {
      name: "Dialog.prompt",
      description:
        "Opens a shared dialog with one text field. Needs `Dialog.Host`.",
    },
  ],
  keyboard: [
    { keys: "Enter", action: "Opens the dialog from its trigger" },
    { keys: "Tab", action: "Moves focus forward and wraps inside the dialog" },
    {
      keys: "Shift+Tab",
      action: "Moves focus back and wraps inside the dialog",
    },
    {
      keys: "Escape",
      action: "Closes the dialog and returns focus to the trigger",
    },
  ],
  accessibility: [
    'Exposes `role="dialog"`, or `role="alertdialog"` with `variant="alert"`, and traps focus while open.',
    "`Dialog.Title` names the popup and `Dialog.Description` describes it.",
    "In a stepped dialog, only the current page's description is linked, so each page reads its own.",
    "Alert dialogs should focus the safe action first: pass `initialFocus` the cancel button.",
    "Focus returns to the trigger when the dialog closes.",
  ],
  examples: [
    { name: "Dialog", render: () => <RenameFolder /> },
    { name: "Alert", render: () => <DeleteFolder /> },
    { name: "Command", render: () => <EmptyTrash /> },
  ],
};
