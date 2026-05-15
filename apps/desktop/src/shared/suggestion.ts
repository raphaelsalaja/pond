export type SuggestionShortcut = "esc" | "enter";

export type SuggestionVariant = "primary" | "secondary" | "ghost";

export interface SuggestionAction {
  id: string;
  label: string;
  shortcut?: SuggestionShortcut;
  variant?: SuggestionVariant;
}

export interface SuggestionPayload {
  /** Stable dedupe key. The same key won't surface twice within the cooldown window. */
  key: string;
  title: string;
  body?: string;
  /** Image URLs for the icon row (top-right). Up to ~6 fit cleanly. */
  icons?: string[];
  actions: SuggestionAction[];
  /** Auto-dismiss timeout in ms. 0 (or omitted) uses the controller default. */
  autoDismissMs?: number;
  /** Cooldown override in ms; defaults to 1h. */
  cooldownMs?: number;
}

export type SuggestionOutcome = "dismissed" | "timed_out" | string;

export interface SuggestionResult {
  key: string;
  outcome: SuggestionOutcome;
}
