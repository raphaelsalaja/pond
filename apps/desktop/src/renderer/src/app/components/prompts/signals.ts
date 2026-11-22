import { loadAppInfo } from "@/shared/lib/app-info";
import {
  type PromptChoice,
  type PromptId,
  readImportedFrom,
} from "@/shared/state/prompts";
import {
  firstSeenAt,
  hasAskedForSupport,
  markAskedForSupport,
} from "../support-dialog/eligibility";
import { type PromptSignals, promptsSettledBy } from "./eligibility";

const FIRST_VERSION_KEY = "pond:firstVersion";
const EXTENSION_SEEN_KEY = "pond:extensionSeen";
const ASKED_PREFIX = "pond:prompted:";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function hasAsked(id: PromptId): boolean {
  return read(`${ASKED_PREFIX}${id}`) !== null;
}

export function markAsked(id: PromptId): void {
  write(`${ASKED_PREFIX}${id}`, String(Date.now()));
}

export function hasAskedFor(choice: PromptChoice): boolean {
  return choice === "support" ? hasAskedForSupport() : hasAsked(choice);
}

export function settlePrompt(choice: PromptChoice): void {
  if (choice === "support") {
    markAskedForSupport();
    return;
  }
  for (const id of promptsSettledBy(choice)) markAsked(id);
}

/** The extension only reports in while it runs, so remember any launch that heard from it. */
function rememberExtension(lastSeen: number | null): boolean {
  if (lastSeen !== null) write(EXTENSION_SEEN_KEY, String(lastSeen));
  return read(EXTENSION_SEEN_KEY) !== null;
}

function rememberFirstVersion(version: string): string {
  const stored = read(FIRST_VERSION_KEY);
  if (stored) return stored;
  write(FIRST_VERSION_KEY, version);
  return version;
}

export async function readPromptSignals(now: number): Promise<PromptSignals> {
  const [counts, { accounts }, extension, { clients }, info] =
    await Promise.all([
      window.pond.query("saves.sidebarCounts", {}),
      window.pond.query("accounts.list", {}),
      window.pond.query("sources.extensionLastSeen", {}),
      window.pond.query("agent.mcpClients", {}),
      loadAppInfo(),
    ]);
  return {
    now,
    saves: counts.library,
    firstSeenAt: firstSeenAt(now),
    updated: rememberFirstVersion(info.version) !== info.version,
    importedFrom: readImportedFrom(),
    xSynced: accounts.some(
      (account) => account.source === "twitter" && account.sync.lastSyncedAt,
    ),
    hasAccounts: accounts.length > 0,
    extensionSeen: rememberExtension(extension.at),
    mcp: clients,
  };
}
