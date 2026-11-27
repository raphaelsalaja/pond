import type { Source } from "@pond/schema/db";
import type { InboxChannel } from "@pond/schema/inbox";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { inboxChannelForTrigger } from "../inbox/intake";
import { resolveIncomingOwner } from "../sync/incoming";
import { inheritIntake, recordIntake } from "./ledger";
import type { IntakeEntry } from "./ledger";
import { migrateIncomingRules } from "./migrate-incoming";
import { scheduleDrain } from "./service";
import { listRules } from "./store";

export interface NewSaveArrival {
  saveId: string;
  source: Source;
  /** The capture path; Saves made from another Save, like crop copies, have none and never run Rules. */
  channel: InboxChannel | undefined;
  ownerId?: string | null;
}

/** Channels some enabled Rule listens to. */
function listeningChannels(): ReadonlySet<InboxChannel> {
  const channels = new Set<InboxChannel>();
  for (const rule of listRules()) {
    if (rule.enabled && rule.trigger.kind === "newSave") {
      for (const channel of rule.trigger.channels) channels.add(channel);
    }
  }
  return channels;
}

/**
 * Remembers new Saves until they settle, when their Rules run. Only Saves on
 * a channel some enabled Rule listens to are kept, so turning a Rule on later
 * never picks up Saves already in flight.
 */
export async function noteNewSaves(
  arrivals: ReadonlyArray<NewSaveArrival>,
): Promise<void> {
  try {
    const wanted = arrivals.filter((arrival) => arrival.channel);
    if (!wanted.length) return;
    await migrateIncomingRules();
    const channels = listeningChannels();
    const entries: Array<IntakeEntry> = [];
    const owners = new Map<string, string | null>();
    for (const arrival of wanted) {
      if (!arrival.channel || !channels.has(arrival.channel)) continue;
      const key = `${arrival.source}\0${arrival.ownerId ?? ""}`;
      if (!owners.has(key)) {
        owners.set(
          key,
          (await resolveIncomingOwner(arrival.ownerId, arrival.source))?.id ??
            null,
        );
      }
      entries.push({
        saveId: arrival.saveId,
        channel: arrival.channel,
        ownerId: owners.get(key) ?? null,
      });
    }
    if (!entries.length) return;
    recordIntake((await getDb()).$raw, entries);
    scheduleDrain();
  } catch (error) {
    log.warn("[pond rules] recording new Saves failed", error);
  }
}

export function noteEnqueuedSaves(
  saves: ReadonlyArray<{ id: string; source: Source }>,
  trigger: string | undefined,
  ownerId: string | null | undefined,
): Promise<void> {
  const channel = inboxChannelForTrigger(trigger);
  return noteNewSaves(
    saves.map((save) => ({
      saveId: save.id,
      source: save.source,
      channel,
      ownerId,
    })),
  );
}

export async function inheritRuleIntake(
  fromSaveId: string,
  saveIds: ReadonlyArray<string>,
): Promise<void> {
  try {
    inheritIntake((await getDb()).$raw, fromSaveId, saveIds);
  } catch (error) {
    log.warn("[pond rules] carrying Rules to split Saves failed", error);
  }
}
