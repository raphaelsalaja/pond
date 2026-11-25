import { useSelector } from "@tanstack/react-store";
import { lazy, Suspense, useState } from "react";
import {
  closeConversionDialog,
  conversionDialogStore,
} from "@/features/library/state/conversion-dialog";

import { DialogLoadError } from "@/shared/components/dialog-load-error";

const ConversionDialog = lazy(() =>
  import(".")
    .then((module) => ({ default: module.ConversionDialog }))
    .catch(() => ({
      default: ({ open }: { open: boolean }) => (
        <DialogLoadError
          open={open}
          title="Couldn't Open Export"
          onClose={closeConversionDialog}
        />
      ),
    })),
);

export function ConversionDialogHost() {
  const state = useSelector(conversionDialogStore, (state) => state);
  const [last, setLast] = useState(state);
  if (state && state !== last) setLast(state);
  return last ? (
    <Suspense fallback={null}>
      <ConversionDialog
        key={last.id}
        ids={last.ids}
        fileIndex={last.fileIndex}
        initialMode={last.mode}
        open={state !== null}
      />
    </Suspense>
  ) : null;
}
