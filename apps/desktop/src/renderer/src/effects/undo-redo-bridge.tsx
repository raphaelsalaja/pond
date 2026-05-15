import { useEffect } from "react";

export function UndoRedoBridge() {
  useEffect(() => {
    const offUndo = window.pond.onEditUndoRequested(() => {
      if (isEditableTarget()) return;
      void window.pond.undo();
    });
    const offRedo = window.pond.onEditRedoRequested(() => {
      if (isEditableTarget()) return;
      void window.pond.redo();
    });
    return () => {
      offUndo();
      offRedo();
    };
  }, []);

  return null;
}

function isEditableTarget(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type.toLowerCase();
    return !NON_TEXT_INPUTS.has(type);
  }
  return false;
}

const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);
