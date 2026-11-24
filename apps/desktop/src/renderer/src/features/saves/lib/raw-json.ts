import { StoredRawJsonSchema, storedAsRawJson } from "@pond/schema/raw-schema";
import { z } from "zod";
import { patchSaveRawJson, pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";

const RawJsonReplySchema = z.object({
  rawJson: StoredRawJsonSchema.transform(storedAsRawJson).nullish().catch(null),
});

const inflight = new Set<string>();
/** List rows carry a trimmed capture, so only objects fetched here count as the full one. */
const full = new WeakSet<NonNullable<Save["rawJson"]>>();

function hasFullRawJson(id: string): boolean {
  const rawJson = pool.get(id)?.rawJson;
  return rawJson === null || (rawJson !== undefined && full.has(rawJson));
}

export async function ensureRawJson(id: string): Promise<void> {
  if (!id || inflight.has(id) || hasFullRawJson(id)) {
    return;
  }
  inflight.add(id);
  try {
    const res = RawJsonReplySchema.parse(
      await window.pond.query("saves.rawJson", { id }),
    );
    const rawJson = res.rawJson ?? null;
    if (rawJson) {
      full.add(rawJson);
    }
    if (pool.get(id)) {
      patchSaveRawJson(id, rawJson);
    }
  } catch {
    /** The Save keeps its trimmed rawJson; the next request retries. */
  } finally {
    inflight.delete(id);
  }
}
