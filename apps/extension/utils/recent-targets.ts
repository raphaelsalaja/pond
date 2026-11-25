import { storage } from "wxt/utils/storage";
import { z } from "zod";

const FOLDER_LIMIT = 6;
const TAG_LIMIT = 12;

const targetsSchema = z.object({
  folderIds: z.array(z.string()).catch([]),
  tags: z.array(z.string()).catch([]),
});

export type RecentTargets = z.infer<typeof targetsSchema>;

const item = storage.defineItem<RecentTargets>("local:recentTargets");

/** Most recent first, each value once, capped at `limit`. */
export function pushRecent(
  current: ReadonlyArray<string>,
  used: ReadonlyArray<string>,
  limit: number,
): Array<string> {
  const fresh = [...new Set(used)];
  const rest = current.filter((value) => !fresh.includes(value));
  return [...fresh, ...rest].slice(0, limit);
}

export async function readRecentTargets(): Promise<RecentTargets> {
  const parsed = targetsSchema.safeParse(await item.getValue());
  return parsed.success ? parsed.data : { folderIds: [], tags: [] };
}

export async function rememberTargets(
  folderIds: ReadonlyArray<string>,
  tags: ReadonlyArray<string>,
): Promise<void> {
  if (folderIds.length === 0 && tags.length === 0) return;
  const current = await readRecentTargets();
  await item.setValue({
    folderIds: pushRecent(current.folderIds, folderIds, FOLDER_LIMIT),
    tags: pushRecent(current.tags, tags, TAG_LIMIT),
  });
}
