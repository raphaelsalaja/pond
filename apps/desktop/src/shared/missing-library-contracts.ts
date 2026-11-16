export const MISSING_LIBRARY_CHOICES = [
  "locate",
  "retry",
  "new",
  "quit",
] as const;

export type MissingLibraryChoice = (typeof MISSING_LIBRARY_CHOICES)[number];

export interface MissingLibraryView {
  name: string;
  path: string;
  detail: string;
  /** Increments on every prompt so a repeated detail still reads as a fresh answer. */
  attempt: number;
}

export const MISSING_LIBRARY_WINDOW_IPC = {
  ready: "pond:missing-library-ready",
  view: "pond:missing-library-view",
  choose: "pond:missing-library-choose",
} as const;
