import { IPC } from "../../../shared/constants";
import type { FishEvent, FishPresence } from "../../../shared/fish-contracts";
import { broadcast } from "../../lib/broadcast";

const activities = new Map<string, NonNullable<FishPresence>>();

export function fishPresence(fishId: string): FishPresence {
  return activities.get(fishId) ?? null;
}

export function setFishPresence(fishId: string, activity: FishPresence): void {
  if (fishPresence(fishId) === activity) return;
  if (activity) activities.set(fishId, activity);
  else activities.delete(fishId);
  broadcast<FishEvent>(IPC.fish, { kind: "presence", fishId, activity });
}

export function announceFishChanged(): void {
  broadcast<FishEvent>(IPC.fish, { kind: "changed" });
}
