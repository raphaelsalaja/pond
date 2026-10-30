import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export const PROMPT_IDS = [
  "cosign",
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

/** Cosign votes close November 18, 2026: the end of that day in Pacific time. */
const COSIGN_CLOSES_AT = Date.UTC(2026, 10, 19, 8);

export function isCosignVotingOpen(now: number): boolean {
  return now < COSIGN_CLOSES_AT;
}

const store = new Store<{ active: PromptId | null }>({ active: null });

export const promptToast = {
  open(id: PromptId): void {
    store.setState(() => ({ active: id }));
  },
  close(): void {
    store.setState((s) => (s.active ? { active: null } : s));
  },
  isOpen(): boolean {
    return store.state.active !== null;
  },
};

export function useActivePrompt(): PromptId | null {
  return useSelector(store, (s) => s.active);
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
