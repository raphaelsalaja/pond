import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

const PROMPT_IDS = [
  "milestone-10000",
  "milestone-1000",
  "friend",
  "github",
  "x",
  "extension",
  "mcp-cursor",
  "mcp-claude",
  "feedback",
] as const;

export type PromptId = (typeof PROMPT_IDS)[number];

export type ImportedFrom = "eagle" | "mymind";

const IMPORTED_FROM_KEY = "pond:importedFrom";

export type PromptChoice = PromptId | "support";

interface PromptState {
  active: PromptChoice | null;
  extensionOpen: boolean;
}

const store = new Store<PromptState>({ active: null, extensionOpen: false });

export const promptCard = {
  show(id: PromptChoice): void {
    store.setState((s) => ({ ...s, active: id }));
  },
  close(): void {
    store.setState((s) => (s.active ? { ...s, active: null } : s));
  },
  setExtensionOpen(extensionOpen: boolean): void {
    store.setState((s) => ({ ...s, extensionOpen }));
  },
};

export function useActivePrompt(): PromptChoice | null {
  return useSelector(store, (s) => s.active);
}

export function useExtensionOpen(): boolean {
  return useSelector(store, (s) => s.extensionOpen);
}

export function markImportedFrom(app: ImportedFrom): void {
  try {
    localStorage.setItem(IMPORTED_FROM_KEY, app);
  } catch {}
}

export function readImportedFrom(): ImportedFrom | null {
  try {
    const value = localStorage.getItem(IMPORTED_FROM_KEY);
    return value === "eagle" || value === "mymind" ? value : null;
  } catch {
    return null;
  }
}
