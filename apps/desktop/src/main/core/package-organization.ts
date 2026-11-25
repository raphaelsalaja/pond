import { join } from "node:path";
import { savedViews, tagGroupMembers, tagGroups, tags } from "@pond/schema/db";
import { isGroup } from "@pond/schema/filters/types";
import type { Query } from "@pond/schema/filters/types";
import { FolderPresentationSchema } from "@pond/schema/folder-presentation";
import { FolderRulesSchema } from "@pond/schema/folder-rules";
import type { Transaction } from "@pond/schema/tx";
import { ulid } from "ulid";
import { z } from "zod";
import { LibraryFilterSchema } from "../../shared/library-query";
import { getDb } from "../db";
import { readBundleJson } from "../lib/library-config";
import { executeBatch, withMutationScope } from "./executor";
import { OrganizationBundleSchema } from "./organization-bundle";
import { getPrefs, setPrefs } from "./prefs";
import { normalizeTagList } from "./tags";

const Tag = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  starred: z.boolean(),
  archived: z.boolean(),
  lastUsedAt: z.number().nullable(),
  usageCount: z.number(),
  createdAt: z.number(),
});
const TagGroup = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  sortOrder: z.number(),
  collapsed: z.boolean(),
  createdAt: z.number(),
});
const Member = z.object({
  tagId: z.string(),
  groupId: z.string(),
  sortOrder: z.number(),
});
export const PackageOrganizationSchema = OrganizationBundleSchema.pick({
  views: true,
}).extend({
  folderRules: z.record(z.string(), FolderRulesSchema).default({}),
  folderViews: z.record(z.string(), FolderPresentationSchema).default({}),
  tags: z.array(Tag).default([]),
  groups: z.array(TagGroup).default([]),
  members: z.array(Member).default([]),
});
export type PackageOrganization = z.infer<typeof PackageOrganizationSchema>;

export async function readPackageOrganization(
  root: string,
  views: PackageOrganization["views"],
  folderIds?: ReadonlyArray<string>,
): Promise<PackageOrganization> {
  const tagsBundle = readBundleJson(join(root, "tags.json"));
  const tagData = tagsBundle
    ? z
        .object({ data: PackageOrganizationSchema.omit({ views: true }) })
        .parse(tagsBundle).data
    : {};
  const settingsBundle = readBundleJson(join(root, "settings.json"));
  const preferences = settingsBundle
    ? z
        .object({
          data: z.object({
            folderRules: z.record(z.string(), FolderRulesSchema).default({}),
            folderViews: z
              .record(z.string(), FolderPresentationSchema)
              .default({}),
          }),
        })
        .parse(settingsBundle).data
    : { folderRules: {}, folderViews: {} };
  return PackageOrganizationSchema.parse({
    views,
    ...tagData,
    folderViews: Object.fromEntries(
      Object.entries(preferences.folderViews).filter(
        ([id]) => !folderIds || folderIds.includes(id),
      ),
    ),
    folderRules: Object.fromEntries(
      Object.entries(preferences.folderRules).filter(
        ([id]) => !folderIds || folderIds.includes(id),
      ),
    ),
  });
}

export function validatePackageOrganization(
  data: PackageOrganization,
  folders: ReadonlyMap<string, unknown>,
): void {
  if (
    [...Object.keys(data.folderRules), ...Object.keys(data.folderViews)].some(
      (id) => !folders.has(id),
    )
  ) {
    throw new Error("A package tag rule references a missing folder.");
  }
  const views = new Map(data.views.map((view) => [view.id, view]));
  if (views.size !== data.views.length) {
    throw new Error("The package contains duplicate view identities.");
  }
  for (const view of data.views) {
    const seen = new Set([view.id]);
    let parent = view.parent_id;
    while (parent) {
      const ancestor = views.get(parent);
      if (ancestor?.kind !== "group" || seen.has(parent)) {
        throw new Error("The package view hierarchy is invalid.");
      }
      seen.add(parent);
      parent = ancestor.parent_id;
    }
    remapQuery(
      LibraryFilterSchema.parse(JSON.parse(view.query)),
      new Map([...folders.keys()].map((id) => [id, id])),
    );
  }
  const tagIds = new Set(data.tags.map((tag) => tag.id));
  const groupIds = new Set(data.groups.map((group) => group.id));
  if (
    tagIds.size !== data.tags.length ||
    groupIds.size !== data.groups.length ||
    data.members.some(
      (member) => !tagIds.has(member.tagId) || !groupIds.has(member.groupId),
    )
  ) {
    throw new Error("The package tag groups are invalid.");
  }
}

function remapQuery(
  query: Query,
  folderIds: ReadonlyMap<string, string>,
): Query {
  return {
    ...query,
    rules: query.rules.map((rule) => {
      if (isGroup(rule)) {
        return remapQuery(rule, folderIds);
      }
      if (rule.field !== "folder" || rule.operator === "empty") {
        return rule;
      }
      if (!Array.isArray(rule.value)) {
        throw new Error("A package folder rule is invalid.");
      }
      return {
        ...rule,
        value: rule.value.map((id) => {
          const mapped = folderIds.get(String(id));
          if (!mapped) {
            throw new Error("A package view references a missing folder.");
          }
          return mapped;
        }),
      };
    }),
  };
}

export function mergePackageOrganization(
  existing: PackageOrganization,
  incoming: PackageOrganization,
  folderIds: ReadonlyMap<string, string>,
  saveIds: ReadonlyMap<string, string> = new Map(),
): PackageOrganization {
  validatePackageOrganization(incoming, folderIds);
  const result = PackageOrganizationSchema.parse(existing);
  for (const [id, rule] of Object.entries(incoming.folderRules)) {
    const mapped = folderIds.get(id);
    if (!mapped) {
      throw new Error("A package tag rule references a missing folder.");
    }
    result.folderRules[mapped] = {
      automaticTags: normalizeTagList([
        ...(result.folderRules[mapped]?.automaticTags ?? []),
        ...rule.automaticTags,
      ]),
    };
  }
  for (const [id, view] of Object.entries(incoming.folderViews)) {
    const mapped = folderIds.get(id);
    if (!mapped) throw new Error("A folder view references a missing folder.");
    const existingView = result.folderViews[mapped];
    const manualOrder = view.manualOrder.flatMap((saveId) => {
      const target = saveIds.get(saveId);
      return target ? [target] : [];
    });
    result.folderViews[mapped] = {
      ...view,
      ...existingView,
      manualOrder: [
        ...new Set([...(existingView?.manualOrder ?? []), ...manualOrder]),
      ],
    };
  }
  const viewIds = new Map<string, string>();
  const pending = [...incoming.views].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  while (pending.length) {
    const index = pending.findIndex(
      (view) => !view.parent_id || viewIds.has(view.parent_id),
    );
    const view = pending.splice(index, 1)[0];
    if (!view || index < 0) {
      throw new Error("The package view hierarchy is invalid.");
    }
    const parent = view.parent_id
      ? (viewIds.get(view.parent_id) ?? null)
      : null;
    const query = JSON.stringify(
      remapQuery(LibraryFilterSchema.parse(JSON.parse(view.query)), folderIds),
    );
    let matched = result.views.find(
      (row) =>
        row.name === view.name &&
        row.kind === view.kind &&
        row.parent_id === parent &&
        row.query === query,
    );
    if (!matched) {
      matched = {
        ...view,
        id: ulid(),
        parent_id: parent,
        query,
        sort_order:
          Math.max(-1, ...result.views.map((row) => row.sort_order)) + 1,
      };
      result.views.push(matched);
    }
    viewIds.set(view.id, matched.id);
  }
  const tagIds = new Map<string, string>();
  for (const tag of incoming.tags) {
    let matched = result.tags.find(
      (row) => row.name.toLocaleLowerCase() === tag.name.toLocaleLowerCase(),
    );
    if (!matched) {
      matched = { ...tag, id: ulid() };
      result.tags.push(matched);
    }
    tagIds.set(tag.id, matched.id);
  }
  const groupIds = new Map<string, string>();
  for (const group of [...incoming.groups].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )) {
    let matched = result.groups.find(
      (row) => row.name.toLocaleLowerCase() === group.name.toLocaleLowerCase(),
    );
    if (!matched) {
      matched = {
        ...group,
        id: ulid(),
        sortOrder:
          Math.max(-1, ...result.groups.map((row) => row.sortOrder)) + 1,
      };
      result.groups.push(matched);
    }
    groupIds.set(group.id, matched.id);
  }
  for (const member of [...incoming.members].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )) {
    const tagId = tagIds.get(member.tagId);
    const groupId = groupIds.get(member.groupId);
    if (!tagId || !groupId) {
      throw new Error("The package tag groups are invalid.");
    }
    if (
      !result.members.some(
        (row) => row.tagId === tagId && row.groupId === groupId,
      )
    ) {
      result.members.push({
        tagId,
        groupId,
        sortOrder:
          Math.max(
            -1,
            ...result.members
              .filter((row) => row.groupId === groupId)
              .map((row) => row.sortOrder),
          ) + 1,
      });
    }
  }
  return result;
}

export async function importPackageOrganization(
  incoming: PackageOrganization,
  folderIds: ReadonlyMap<string, string>,
  saveIds: ReadonlyMap<string, string>,
): Promise<void> {
  return withMutationScope(async () => {
    const db = await getDb();
    const [viewRows, tagRows, groupRows, members] = await Promise.all([
      db.select().from(savedViews),
      db.select().from(tags),
      db.select().from(tagGroups),
      db.select().from(tagGroupMembers),
    ]);
    const existing: PackageOrganization = {
      folderRules: (await getPrefs()).folderRules,
      folderViews: (await getPrefs()).folderViews,
      views: viewRows.map((view) => ({
        id: view.id,
        name: view.name,
        kind: view.kind,
        parent_id: view.parentId,
        question: view.question,
        query: JSON.stringify(view.query),
        sort_key: view.sortKey,
        sort_dir: view.sortDir,
        layout: view.layout,
        sort_order: view.sortOrder,
        created_at: view.createdAt.getTime(),
      })),
      tags: tagRows.map((tag) => ({
        ...tag,
        lastUsedAt: tag.lastUsedAt?.getTime() ?? null,
        createdAt: tag.createdAt.getTime(),
      })),
      groups: groupRows.map((group) => ({
        ...group,
        createdAt: group.createdAt.getTime(),
      })),
      members,
    };
    const merged = mergePackageOrganization(
      existing,
      incoming,
      folderIds,
      saveIds,
    );
    const transactions: Array<Transaction> = [];
    const meta = {
      actor: "user" as const,
      actorReason: "package-organization-import",
    };
    for (const row of merged.views.filter(
      (view) => !existing.views.some((old) => old.id === view.id),
    )) {
      transactions.push({
        kind: "create",
        model: "saved_view",
        id: row.id,
        data: {
          id: row.id,
          name: row.name,
          kind: row.kind,
          parentId: row.parent_id,
          question: row.question,
          query: LibraryFilterSchema.parse(JSON.parse(row.query)),
          sortKey: row.sort_key,
          sortDir: row.sort_dir,
          layout: row.layout,
          sortOrder: row.sort_order,
          createdAt: new Date(row.created_at),
        },
        meta,
      });
    }
    for (const row of merged.tags.filter(
      (tag) => !existing.tags.some((old) => old.id === tag.id),
    )) {
      transactions.push({
        kind: "create",
        model: "tag",
        id: row.id,
        data: {
          ...row,
          lastUsedAt: row.lastUsedAt === null ? null : new Date(row.lastUsedAt),
          createdAt: new Date(row.createdAt),
        },
        meta,
      });
    }
    for (const row of merged.groups.filter(
      (group) => !existing.groups.some((old) => old.id === group.id),
    )) {
      transactions.push({
        kind: "create",
        model: "tag_group",
        id: row.id,
        data: { ...row, createdAt: new Date(row.createdAt) },
        meta,
      });
    }
    for (const row of merged.members.filter(
      (member) =>
        !existing.members.some(
          (old) => old.tagId === member.tagId && old.groupId === member.groupId,
        ),
    )) {
      transactions.push({
        kind: "create",
        model: "tag_group_member",
        id: `${row.tagId}:${row.groupId}`,
        data: row,
        meta,
      });
    }
    if (transactions.length) {
      await executeBatch(transactions);
    }
    if (
      Object.keys(incoming.folderRules).length ||
      Object.keys(incoming.folderViews).length
    ) {
      await setPrefs({
        folderRules: merged.folderRules,
        folderViews: merged.folderViews,
      });
    }
  });
}
