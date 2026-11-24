import { join } from "node:path";
import { z } from "zod";
import { DUPLICATE_RELATIONS } from "../../../shared/duplicate-contracts";
import type { DuplicateDismissal } from "../../../shared/duplicate-contracts";
import { readBundleJson, writeBundleJson } from "../../lib/library-config";
import { resolvePaths } from "../../paths";
import { orderIds, pairKey } from "./types";

const DismissalSchema = z.object({
  ids: z.tuple([z.string(), z.string()]),
  relation: z.enum(DUPLICATE_RELATIONS),
});

const StoredSchema = z.array(z.unknown()).catch([]);

/** Kept in the Library, not the index database, so a Keep Separate choice survives a rebuilt index and travels with the Library. */
export function dismissalsFile(
  libraryRoot = resolvePaths().libraryRoot,
): string {
  return join(libraryRoot, "duplicates", "dismissed.json");
}

export function readDismissals(
  file = dismissalsFile(),
): Array<DuplicateDismissal> {
  const stored = readBundleJson(file);
  if (!stored) {
    return [];
  }
  return StoredSchema.parse(stored.data).flatMap((item) => {
    const parsed = DismissalSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function addDismissals(
  pairs: ReadonlyArray<DuplicateDismissal>,
  file = dismissalsFile(),
): number {
  const byPair = new Map(
    readDismissals(file).map((item) => [
      pairKey(item.ids[0], item.ids[1]),
      item,
    ]),
  );
  let added = 0;
  for (const pair of pairs) {
    if (pair.ids[0] === pair.ids[1]) {
      continue;
    }
    const ids = orderIds(pair.ids[0], pair.ids[1]);
    const key = pairKey(ids[0], ids[1]);
    const current = byPair.get(key);
    if (current?.relation === pair.relation) {
      continue;
    }
    byPair.set(key, { ids, relation: pair.relation });
    added += 1;
  }
  if (added > 0) {
    writeBundleJson(file, [...byPair.values()]);
  }
  return added;
}
