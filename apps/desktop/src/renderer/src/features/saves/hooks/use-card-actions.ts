import { useCallback, useEffect } from "react";
import type { SaveListMode } from "@/features/saves/lib/list";
import {
  pasteImportOf,
  runPasteImport,
} from "@/features/saves/lib/paste-import";
import {
  clearSaveSelection,
  clickSave,
  pickSave,
} from "@/features/saves/lib/select";
import { isLibrarySaveDrag } from "@/features/saves/lib/start-drag";
import { runViewerAction } from "@/features/saves/lib/viewer-actions";
import {
  useSelectionActive,
  useSelectionSize,
} from "@/features/saves/state/selection";
import { usePrefs } from "@/shared/state/prefs";

interface CardActions {
  selectionSize: number;
  multiSelectActive: boolean;
  handleCardClick: (id: string, e: React.MouseEvent) => void;
  handleCardPick: (id: string, e: React.MouseEvent) => void;
  handleCardAuxClick: (id: string, e: React.MouseEvent) => void;
  focus: (id: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => Promise<void>;
}

export function useCardActions(
  filteredIds: ReadonlyArray<string>,
  mode: SaveListMode,
  sourceFilter: string,
): CardActions {
  const [viewer] = usePrefs("viewer");
  const selectionSize = useSelectionSize();
  const multiSelectActive = useSelectionActive();

  const focus = useCallback(
    (id: string) => {
      runViewerAction(id, viewer.doubleClickAction);
    },
    [viewer.doubleClickAction],
  );

  const handleCardAuxClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      runViewerAction(id, viewer.middleClickAction);
    },
    [viewer.middleClickAction],
  );

  const handleCardClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      if (meta || shift) e.preventDefault();
      clickSave(id, { meta, shift }, filteredIds);
    },
    [filteredIds],
  );

  const handleCardPick = useCallback(
    (id: string, e: React.MouseEvent) => {
      pickSave(id, { shift: e.shiftKey }, filteredIds);
    },
    [filteredIds],
  );

  useEffect(() => {
    void mode;
    void sourceFilter;
    clearSaveSelection();
  }, [mode, sourceFilter]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLElement &&
        (el.isContentEditable ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "INPUT")
      ) {
        return;
      }

      const data = e.clipboardData;
      if (!data) return;
      const plan = pasteImportOf(data);
      if (!plan) return;
      e.preventDefault();
      void runPasteImport(plan);
    };

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer || isLibrarySaveDrag(e.dataTransfer)) return;
    const types = Array.from(e.dataTransfer.types ?? []);
    if (
      types.includes("text/uri-list") ||
      types.includes("text/plain") ||
      types.includes("Files")
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt || isLibrarySaveDrag(dt)) return;

    const plan = pasteImportOf(dt);
    if (plan && plan.kind !== "clipboard") await runPasteImport(plan);
  }, []);

  return {
    selectionSize,
    multiSelectActive,
    handleCardClick,
    handleCardPick,
    handleCardAuxClick,
    focus,
    onDragOver,
    onDrop,
  };
}
