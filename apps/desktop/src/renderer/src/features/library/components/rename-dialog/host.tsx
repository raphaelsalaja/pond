import { useSelector } from "@tanstack/react-store";
import { lazy, Suspense, useState } from "react";
import {
  closeRenameDialog,
  renameDialogStore,
} from "@/features/library/state/rename-dialog";
import { DialogLoadError } from "@/shared/components/dialog-load-error";

const RenameDialog = lazy(() =>
  import(".")
    .then((module) => ({ default: module.RenameDialog }))
    .catch(() => ({
      default: ({ open }: { open: boolean }) => (
        <DialogLoadError
          open={open}
          title="Couldn't Open Rename"
          onClose={closeRenameDialog}
        />
      ),
    })),
);

export function RenameDialogHost() {
  const state = useSelector(renameDialogStore, (value) => value);
  const [last, setLast] = useState(state);
  if (state && state !== last) setLast(state);
  return last ? (
    <Suspense fallback={null}>
      <RenameDialog key={last.id} ids={last.ids} open={state !== null} />
    </Suspense>
  ) : null;
}
