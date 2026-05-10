import { createContext, use } from "react";
import type { MediaUnit } from "@/pool/media";
import type { Save } from "@/pool/types";

export type CardLayout = "waterfall" | "grid" | "justified";

export type CardSelection = "primary" | "multi";

export interface CardState {
  save: Save;
  unit: MediaUnit | null;
  isBroken: boolean;
  isDownloading: boolean;
}

export interface CardActions {
  setBroken: (broken: boolean) => void;
  healVideo: () => void;
}

export interface CardContextValue {
  state: CardState;
  actions: CardActions;
}

export const CardContext = createContext<CardContextValue | null>(null);

export function useCardContext(): CardContextValue {
  const ctx = use(CardContext);
  if (!ctx) {
    throw new Error("Card.* components must be rendered inside <Card.Root>");
  }
  return ctx;
}
