import { useEffect } from "react";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { currentUndoOwner } from "@/shared/lib/undo-owner";
import { reflectHistoryChange } from "@/shared/lib/undo-toast";

async function runHistory(direction: "undo" | "redo"): Promise<void> {
  try {
    const result =
      direction === "undo"
        ? await window.pond.undo()
        : await window.pond.redo();
    reflectHistoryChange(direction, result);
  } catch {
    reflectHistoryChange(direction, null);
  }
}

export function UndoRedoBridge() {
  useEffect(() => {
    const offUndo = window.pond.onEditUndoRequested(() => {
      if (isEditableTarget()) return;
      const owner = currentUndoOwner();
      if (owner) owner.undo();
      else void runHistory("undo");
    });
    const offRedo = window.pond.onEditRedoRequested(() => {
      if (isEditableTarget()) return;
      const owner = currentUndoOwner();
      if (owner) owner.redo();
      else void runHistory("redo");
    });
    return () => {
      offUndo();
      offRedo();
    };
  }, []);

  return null;
}
