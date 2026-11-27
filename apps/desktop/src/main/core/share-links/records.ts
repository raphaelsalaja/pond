import { join } from "node:path";
import { z } from "zod";
import { ShareLinkSchema } from "../../../shared/share-link-contracts";
import type { ShareLink } from "../../../shared/share-link-contracts";
import {
  readBundleJsonAsync,
  writeBundleJsonAsync,
} from "../../lib/library-config";

/** Share Links point at Library content, so their records travel with the Library. */
function recordsFile(libraryRoot: string): string {
  return join(libraryRoot, "share-links.json");
}

const RecordsSchema = z.array(ShareLinkSchema);

export async function readShareLinks(
  libraryRoot: string,
): Promise<Array<ShareLink>> {
  const stored = await readBundleJsonAsync(recordsFile(libraryRoot));
  if (!stored) return [];
  const parsed = RecordsSchema.safeParse(stored.data);
  if (!parsed.success)
    throw new Error("Pond couldn't read this Library's Share Links.");
  return parsed.data;
}

let writes: Promise<unknown> = Promise.resolve();

/** Runs one read-modify-write at a time, so two jobs never drop each other's records. */
function updateShareLinks<T>(
  libraryRoot: string,
  change: (links: Array<ShareLink>) => { links: Array<ShareLink>; result: T },
): Promise<T> {
  const next = writes.then(async () => {
    const { links, result } = change(await readShareLinks(libraryRoot));
    await writeBundleJsonAsync(recordsFile(libraryRoot), links);
    return result;
  });
  writes = next.catch(() => undefined);
  return next;
}

export function upsertShareLink(
  libraryRoot: string,
  link: ShareLink,
): Promise<void> {
  return updateShareLinks(libraryRoot, (links) => ({
    links: [...links.filter((entry) => entry.id !== link.id), link],
    result: undefined,
  }));
}

export function patchShareLink(
  libraryRoot: string,
  id: string,
  patch: Partial<ShareLink>,
): Promise<ShareLink | null> {
  return updateShareLinks(libraryRoot, (links) => {
    const current = links.find((entry) => entry.id === id);
    if (!current) return { links, result: null };
    const next = { ...current, ...patch };
    return {
      links: links.map((entry) => (entry.id === id ? next : entry)),
      result: next,
    };
  });
}

export function removeShareLinkRecord(
  libraryRoot: string,
  id: string,
): Promise<void> {
  return updateShareLinks(libraryRoot, (links) => ({
    links: links.filter((entry) => entry.id !== id),
    result: undefined,
  }));
}
