import {
  tagGroupMembers as tagGroupMembersTable,
  tagGroups as tagGroupsTable,
  tags as tagsTable,
} from "@pond/schema/db";
import type { Tag, TagGroup } from "@pond/schema/db";
import log from "electron-log/main.js";
import { z } from "zod";
import { getDb } from "../db";
import {
  createDebouncedTask,
  readBundleJson,
  writeBundleJson,
} from "../lib/library-config";
import { resolvePaths } from "../paths";

const TAG_MODELS = new Set(["tag", "tag_group", "tag_group_member"]);

export function isTagModel(model: string): boolean {
  return TAG_MODELS.has(model);
}

interface WireTag {
  id: string;
  name: string;
  description: string | null;
  starred: boolean;
  archived: boolean;
  lastUsedAt: number | null;
  usageCount: number;
  createdAt: number;
}

interface WireTagGroup {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  collapsed: boolean;
  createdAt: number;
}

interface WireTagGroupMember {
  tagId: string;
  groupId: string;
  sortOrder: number;
}

interface TagsBundle {
  tags: Array<WireTag>;
  groups: Array<WireTagGroup>;
  members: Array<WireTagGroupMember>;
}

const StoredInstantSchema = z
  .number()
  .refine(Number.isFinite)
  .transform((ms) => new Date(ms))
  .nullable()
  .catch(null);

const StoredTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish().catch(null),
  starred: z.boolean().optional().catch(undefined),
  archived: z.boolean().optional().catch(undefined),
  lastUsedAt: StoredInstantSchema,
  usageCount: z.number().optional().catch(undefined),
  createdAt: StoredInstantSchema,
});

const StoredTagGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish().catch(null),
  color: z.string().nullish().catch(null),
  sortOrder: z.number().optional().catch(undefined),
  collapsed: z.boolean().optional().catch(undefined),
  createdAt: StoredInstantSchema,
});

const StoredTagGroupMemberSchema = z.object({
  tagId: z.string(),
  groupId: z.string(),
  sortOrder: z.number().catch(0),
});

function storedList<T>(schema: z.ZodType<T>) {
  return z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => schema.safeParse(item).data ?? []),
    )
    .optional()
    .catch(undefined);
}

const StoredTagsBundleSchema = z
  .object({
    tags: storedList(StoredTagSchema),
    groups: storedList(StoredTagGroupSchema),
    members: storedList(StoredTagGroupMemberSchema),
  })
  .catch({});

type StoredTag = z.infer<typeof StoredTagSchema>;
type StoredTagGroup = z.infer<typeof StoredTagGroupSchema>;

async function dumpTagsToBundle(): Promise<void> {
  const db = await getDb();
  const [tagRows, groupRows, memberRows] = await Promise.all([
    db.select().from(tagsTable),
    db.select().from(tagGroupsTable),
    db.select().from(tagGroupMembersTable),
  ]);
  const body: TagsBundle = {
    tags: tagRows.map(tagToWire),
    groups: groupRows.map(groupToWire),
    members: memberRows,
  };
  writeBundleJson(resolvePaths().tagsFile, body);
}

const debouncedDump = createDebouncedTask(dumpTagsToBundle);

export function scheduleTagsDump(): void {
  debouncedDump.schedule();
}

export async function flushTagsDump(): Promise<void> {
  await debouncedDump.flush();
}

export async function hydrateTagsFromBundle(): Promise<void> {
  const paths = resolvePaths();
  const read = readBundleJson(paths.tagsFile, paths.backupDir);

  const db = await getDb();
  const existingTags = await db.select({ id: tagsTable.id }).from(tagsTable);
  const existingGroups = await db
    .select({ id: tagGroupsTable.id })
    .from(tagGroupsTable);
  const indexHasRows = existingTags.length > 0 || existingGroups.length > 0;

  const bundle = StoredTagsBundleSchema.parse(read?.data);
  if (!read || !bundle.tags) {
    if (indexHasRows) {
      await dumpTagsToBundle();
      log.info("[pond tags-bundle] seeded tags.json from index");
    }
    return;
  }

  const wireTags = bundle.tags;
  const wireGroups = bundle.groups ?? [];
  const wireMembers = bundle.members ?? [];

  const knownTagIds = new Set(existingTags.map((t) => t.id));
  const knownGroupIds = new Set(existingGroups.map((g) => g.id));
  const bundleTagIds = new Set(wireTags.map((t) => t.id));
  const bundleGroupIds = new Set(wireGroups.map((g) => g.id));

  let inserted = 0;
  const raw = db.$raw;
  raw.transaction(() => {
    for (const tag of wireTags) {
      if (knownTagIds.has(tag.id)) continue;
      db.insert(tagsTable).values(tagFromWire(tag)).onConflictDoNothing().run();
      inserted += 1;
    }
    for (const group of wireGroups) {
      if (knownGroupIds.has(group.id)) continue;
      db.insert(tagGroupsTable)
        .values(groupFromWire(group))
        .onConflictDoNothing()
        .run();
      inserted += 1;
    }
    for (const member of wireMembers) {
      const tagOk =
        knownTagIds.has(member.tagId) || bundleTagIds.has(member.tagId);
      const groupOk =
        knownGroupIds.has(member.groupId) || bundleGroupIds.has(member.groupId);
      if (!tagOk || !groupOk) continue;
      db.insert(tagGroupMembersTable)
        .values(member)
        .onConflictDoNothing()
        .run();
    }
  })();

  if (inserted > 0) {
    log.info(`[pond tags-bundle] hydrated ${inserted} rows from tags.json`);
  }
  await dumpTagsToBundle();
}

function tagToWire(tag: Tag): WireTag {
  return {
    id: tag.id,
    name: tag.name,
    description: tag.description,
    starred: tag.starred,
    archived: tag.archived,
    lastUsedAt: tag.lastUsedAt ? tag.lastUsedAt.getTime() : null,
    usageCount: tag.usageCount,
    createdAt: tag.createdAt.getTime(),
  };
}

function groupToWire(group: TagGroup): WireTagGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    sortOrder: group.sortOrder,
    collapsed: group.collapsed,
    createdAt: group.createdAt.getTime(),
  };
}

function tagFromWire(tag: StoredTag): Tag {
  return {
    id: tag.id,
    name: tag.name,
    description: tag.description ?? null,
    starred: tag.starred === true,
    archived: tag.archived === true,
    lastUsedAt: tag.lastUsedAt,
    usageCount: tag.usageCount ?? 0,
    createdAt: tag.createdAt ?? new Date(),
  };
}

function groupFromWire(group: StoredTagGroup): TagGroup {
  return {
    id: group.id,
    name: group.name,
    description: group.description ?? null,
    color: group.color ?? null,
    sortOrder: group.sortOrder ?? 0,
    collapsed: group.collapsed === true,
    createdAt: group.createdAt ?? new Date(),
  };
}
