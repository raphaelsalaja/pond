import { createContext, use } from "react";
import type { WindowSide } from "./handle";

export interface WindowContextValue {
  state: Record<WindowSide, boolean>;
}

export const WindowContext = createContext<WindowContextValue | null>(null);

export function useWindow(): WindowContextValue {
  const context = use(WindowContext);
  if (!context) {
    throw new Error("Window.* parts must be rendered inside <Window.Root>");
  }
  return context;
}
