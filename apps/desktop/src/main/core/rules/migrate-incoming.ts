import { randomUUID } from "node:crypto";
import type { IncomingSaveRule, Source } from "@pond/schema/db";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import { sourceLabel } from "@pond/schema/sources";
import log from "electron-log/main.js";
import { RULE_CHANNELS } from "../../../shared/rule-contracts";
import type { Rule, RuleAction } from "../../../shared/rule-contracts";
import { listAccounts, patchAccountSync } from "../sync/accounts";
import { listWatches, patchWatchSync } from "../sync/watches";
import { markIncomingMigrated, readRules } from "./store";

interface IncomingOwner {
  id: string;
  source: Source;
  name: string;
  incoming: IncomingSaveRule | undefined;
}

function actionsFor(incoming: IncomingSaveRule | undefined): Array<RuleAction> {
  const actions: Array<RuleAction> = [];
  if (incoming?.folderId) {
    actions.push({ kind: "addToFolder", folderId: incoming.folderId });
  }
  const tags = (incoming?.tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  if (tags.length) actions.push({ kind: "addTags", tags: tags.slice(0, 50) });
  return actions;
}

/**
 * The Rule that does what an Account's or Watch's incoming filing did: it
 * listens to every capture path, because filing used to apply to captures
 * the owner was resolved for too, and it keeps the owner resolution.
 */
function incomingRule(owner: IncomingOwner, now: number): Rule | null {
  const actions = actionsFor(owner.incoming);
  if (!actions.length) return null;
  return {
    id: randomUUID(),
    name: `New from ${owner.name}`.slice(0, 80),
    enabled: true,
    trigger: {
      kind: "newSave",
      channels: [...RULE_CHANNELS],
      ownerId: owner.id,
    },
    conditions: EMPTY_QUERY,
    actions,
    createdAt: now,
    updatedAt: now,
  };
}

function ownerName(
  source: Source,
  label: string | null,
  handle: string | null,
): string {
  const who = label?.trim() || handle?.trim();
  return who ? `${sourceLabel(source)} ${who}` : sourceLabel(source);
}

let running: Promise<number> | null = null;

/** Moves Source incoming filing into Rules once per Library, then clears the old settings so nothing files twice. */
export function migrateIncomingRules(now = Date.now()): Promise<number> {
  if (readRules().incomingMigrated) return Promise.resolve(0);
  running ??= migrate(now).finally(() => {
    running = null;
  });
  return running;
}

async function migrate(now: number): Promise<number> {
  if (readRules().incomingMigrated) return 0;
  const owners: Array<IncomingOwner & { kind: "account" | "watch" }> = [
    ...(await listAccounts()).map((account) => ({
      kind: "account" as const,
      id: account.id,
      source: account.source,
      name: ownerName(account.source, account.label, account.handle),
      incoming: account.sync.incoming,
    })),
    ...(await listWatches()).map((watch) => ({
      kind: "watch" as const,
      id: watch.id,
      source: watch.source,
      name: ownerName(watch.source, watch.label, watch.handle),
      incoming: watch.sync.incoming,
    })),
  ];
  const added = owners.flatMap((owner) => {
    const rule = incomingRule(owner, now);
    return rule ? [rule] : [];
  });
  markIncomingMigrated(added);
  for (const owner of owners) {
    if (!owner.incoming) continue;
    if (owner.kind === "account") {
      await patchAccountSync(owner.id, { incoming: undefined });
    } else {
      await patchWatchSync(owner.id, { incoming: undefined });
    }
  }
  if (added.length) {
    log.info("[pond rules] moved Source filing into Rules", {
      rules: added.length,
    });
  }
  return added.length;
}
