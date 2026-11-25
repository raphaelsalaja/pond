import { Button, Dialog } from "@pond/ui";

export function DialogLoadError({
  open,
  title,
  onClose,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Popup>
          <Dialog.Header>
            <Dialog.Title>{title}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Content>
            <Dialog.Description role="alert">
              This window couldn&apos;t load. Reload Pond to try again.
            </Dialog.Description>
          </Dialog.Content>
          <Dialog.Footer>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => window.location.reload()}>Reload</Button>
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
