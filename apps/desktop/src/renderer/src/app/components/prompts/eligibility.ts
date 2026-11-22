import type { McpClientStatus } from "@shared/mcp-hosts";
import {
  type ImportedFrom,
  type PromptChoice,
  type PromptId,
} from "@/shared/state/prompts";
import { shouldAskForSupport } from "../support-dialog/eligibility";

export type { PromptChoice };

export interface PromptSignals {
  now: number;
  saves: number;
  firstSeenAt: number;
  /** Pond has run a newer version than the one first installed. */
  updated: boolean;
  importedFrom: ImportedFrom | null;
  xSynced: boolean;
  hasAccounts: boolean;
  extensionSeen: boolean;
  mcp: readonly McpClientStatus[];
}

const DAY = 24 * 60 * 60 * 1000;

function usedFor(signals: PromptSignals, days: number): boolean {
  return signals.now - signals.firstSeenAt >= days * DAY;
}

function wantsMcp(signals: PromptSignals, id: McpClientStatus["id"]): boolean {
  const client = signals.mcp.find((entry) => entry.id === id);
  return Boolean(client?.installed && !client.connected) && usedFor(signals, 3);
}

/** Earlier entries win; time-limited and celebratory asks come before evergreen ones. */
const RULES: readonly [PromptChoice, (signals: PromptSignals) => boolean][] = [
  ["milestone-10000", (s) => s.saves >= 10_000 && usedFor(s, 7)],
  ["milestone-1000", (s) => s.saves >= 1_000 && usedFor(s, 7)],
  ["friend", (s) => s.importedFrom !== null],
  ["support", (s) => shouldAskForSupport(s)],
  ["github", (s) => s.updated],
  ["x", (s) => s.xSynced],
  ["extension", (s) => !s.hasAccounts && !s.extensionSeen && usedFor(s, 3)],
  ["mcp-cursor", (s) => wantsMcp(s, "cursor")],
  ["mcp-claude", (s) => wantsMcp(s, "claude-desktop")],
  ["feedback", (s) => usedFor(s, 14)],
];

export function pickPrompt(
  signals: PromptSignals,
  asked: (id: PromptChoice) => boolean,
): PromptChoice | null {
  return RULES.find(([id, rule]) => !asked(id) && rule(signals))?.[0] ?? null;
}

/** Celebrating 10,000 saves makes the 1,000 one stale. */
export function promptsSettledBy(id: PromptId): PromptId[] {
  return id === "milestone-10000" ? [id, "milestone-1000"] : [id];
}
