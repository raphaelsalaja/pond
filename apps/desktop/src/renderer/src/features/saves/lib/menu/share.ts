import { IconFolderSend } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { CAN_SHARE } from "@/shared/lib/platform";
import { notify } from "@/shared/lib/toast";
import { glyph } from "./shared";
import type { SaveMenuContext } from "./types";

export function buildShareItem({
  save,
  batch,
  hasFiles,
  fileIndex,
}: SaveMenuContext): MenuItemSpec {
  return {
    label: "Share",
    icon: glyph(IconFolderSend),
    hidden: !CAN_SHARE || !hasFiles || batch,
    onClick: () => {
      void window.pond
        .query("saves.share", {
          id: save.id,
          fileIndex: fileIndex ?? undefined,
        })
        .then((result) => {
          if (!result.ok) {
            notify({
              id: "share",
              title: result.error ?? "Couldn't share this file.",
            });
          }
        });
    },
  };
}
