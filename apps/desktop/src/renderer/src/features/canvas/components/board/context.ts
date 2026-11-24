import type { CanvasCrop, CanvasSide } from "@shared/canvas-contracts";
import { createContext, useContext } from "react";
import type { ConnectorStyle } from "../../lib/document";

export interface BoardActions {
  editingId: string | null;
  savesReady: boolean;
  connectorBarId: string | null;
  barsHidden: boolean;
  croppingId: string | null;
  record: () => void;
  setText: (id: string, text: string) => void;
  setRows: (id: string, rows: Array<Array<string>>) => void;
  setCrop: (id: string, crop: CanvasCrop | null) => void;
  replaceSave: (id: string, saveId: string) => void;
  startEditing: (id: string) => void;
  /** Ignored unless `id` is still the item being edited, so a late blur can't end the next edit. */
  finishEditing: (id: string) => void;
  branch: (id: string, kind: "child" | "sibling") => void;
  quickCreate: (id: string, side: CanvasSide) => void;
  restyle: (patch: Partial<ConnectorStyle>) => void;
  deleteConnectors: () => void;
}

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoard(): BoardActions {
  const board = useContext(BoardContext);
  if (!board) {
    throw new Error("Canvas items render inside a board.");
  }
  return board;
}
