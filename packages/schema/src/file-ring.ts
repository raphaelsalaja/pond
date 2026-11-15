import { z } from "zod";

export const FILE_RING_ACTIONS = [
  "new-folder",
  "export-files",
  "search",
  "new-note",
  "import-files",
  "import-links",
] as const;

export type FileRingAction = (typeof FILE_RING_ACTIONS)[number];

export const FILE_RING_CAPACITY = 6;

const FileRingItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("folder"), folderId: z.string().min(1) }),
  z.object({ kind: z.literal("action"), action: z.enum(FILE_RING_ACTIONS) }),
]);

export type FileRingItem = z.infer<typeof FileRingItemSchema>;

export function fileRingItemKey(item: FileRingItem): string {
  return item.kind === "folder"
    ? `folder:${item.folderId}`
    : `action:${item.action}`;
}

/** Drops entries this build doesn't know, so one retired action never resets the rest of the ring. */
function knownItems(items: readonly unknown[]): FileRingItem[] {
  const seen = new Set<string>();
  return items
    .flatMap((item) => {
      const parsed = FileRingItemSchema.safeParse(item);
      if (!parsed.success) return [];
      const key = fileRingItemKey(parsed.data);
      if (seen.has(key)) return [];
      seen.add(key);
      return [parsed.data];
    })
    .slice(0, FILE_RING_CAPACITY);
}

export const FileRingPrefsSchema = z.object({
  /** Null keeps the automatic ring of Quick Access and recent folders. */
  items: z.array(z.unknown()).transform(knownItems).nullable().catch(null),
});
