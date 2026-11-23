import { Dialog, Empty } from "@pond/ui";
import { useState } from "react";
import { useMediaPickOptions } from "@/features/saves/hooks/use-media-pick-options";
import { useSave } from "@/features/saves/hooks/use-saves";
import { cardThumbnailUrl } from "@/features/saves/lib/media/units";
import { displayTitleForSave } from "@/features/saves/lib/text";
import {
  closeThumbnailViewer,
  useThumbnailViewer,
} from "@/features/saves/state/thumbnail-viewer";
import { useRetainedDialogPayload } from "@/shared/hooks/use-retained-dialog-payload";
import styles from "./styles.module.css";

export function ThumbnailViewerHost() {
  const state = useThumbnailViewer();
  const presentation = useRetainedDialogPayload(state);
  return presentation.payload ? (
    <ThumbnailViewer
      key={presentation.payload.id}
      open={presentation.open}
      saveId={presentation.payload.saveId}
    />
  ) : null;
}

function ThumbnailViewer({ open, saveId }: { open: boolean; saveId: string }) {
  const save = useSave(saveId);
  const pickOptions = useMediaPickOptions();
  const url = save ? cardThumbnailUrl(save, pickOptions) : null;
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeThumbnailViewer();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup variant="media" aria-label="Thumbnail">
          {save && url && failed !== url ? (
            <img
              className={styles.image}
              src={url}
              alt={displayTitleForSave(save)}
              draggable={false}
              onError={() => setFailed(url)}
            />
          ) : (
            <Empty.Root>
              <Empty.Title>Couldn't load the thumbnail</Empty.Title>
            </Empty.Root>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
