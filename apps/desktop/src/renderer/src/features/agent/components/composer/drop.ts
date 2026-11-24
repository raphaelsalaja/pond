import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { COMMAND_PRIORITY_HIGH, DRAGOVER_COMMAND, DROP_COMMAND } from "lexical";
import { useEffect, useEffectEvent } from "react";
import { isLibrarySaveDrag, saveDropIds } from "@/features/saves";

export function ComposerDrop({
  onDropIds,
}: {
  onDropIds: (ids: Array<string>) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const drop = useEffectEvent(onDropIds);
  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          DRAGOVER_COMMAND,
          (event) => {
            if (!isLibrarySaveDrag(event.dataTransfer)) {
              return false;
            }
            event.preventDefault();
            if (event.dataTransfer) {
              event.dataTransfer.dropEffect = "copy";
            }
            return true;
          },
          COMMAND_PRIORITY_HIGH,
        ),
        editor.registerCommand(
          DROP_COMMAND,
          (event) => {
            const ids = saveDropIds(event.dataTransfer);
            if (!ids.length) {
              return false;
            }
            event.preventDefault();
            drop(ids);
            return true;
          },
          COMMAND_PRIORITY_HIGH,
        ),
      ),
    [editor],
  );
  return null;
}
