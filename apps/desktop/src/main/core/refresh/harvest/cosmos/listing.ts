import { z } from "zod";
import type { ListEntry } from "../list-types";

const OptionalText = z.string().min(1).optional().catch(undefined);
const OptionalId = z
  .union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
  .optional()
  .catch(undefined);

export const CosmosMeDataSchema = z
  .object({
    me: z
      .object({
        id: OptionalId,
        username: OptionalText,
        avatarUrl: OptionalText,
      })
      .nullable()
      .optional()
      .catch(undefined),
  })
  .catch({});

export type CosmosMeData = z.infer<typeof CosmosMeDataSchema>;

const CosmosTileSchema = z
  .object({
    id: OptionalId,
    shareUrl: OptionalText,
    createdAt: OptionalText,
  })
  .catch({});

const CosmosClusterSchema = z
  .object({
    id: OptionalId,
    name: OptionalText,
    slug: OptionalText,
    owner: z.object({ username: OptionalText }).optional().catch(undefined),
    numberOfElements: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .catch(undefined),
    isPrivate: z.boolean().optional().catch(undefined),
  })
  .catch({});

export const CosmosLibraryDataSchema = z
  .object({
    allElementsV2: z
      .object({
        items: z.array(CosmosTileSchema).optional().catch(undefined),
        meta: z
          .object({
            nextPageCursor: OptionalText,
            count: z.number().optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .nullable()
      .optional()
      .catch(undefined),
  })
  .catch({});

export type CosmosLibraryData = z.infer<typeof CosmosLibraryDataSchema>;

export const CosmosClustersDataSchema = z
  .object({
    userClusters: z
      .object({
        items: z.array(CosmosClusterSchema).optional().catch(undefined),
        meta: z
          .object({ nextPageCursor: OptionalText })
          .optional()
          .catch(undefined),
      })
      .nullable()
      .optional()
      .catch(undefined),
  })
  .catch({});

export const CosmosClusterConnectionsDataSchema = z
  .object({
    clusterConnections: z
      .object({
        items: z
          .array(
            z
              .object({ element: CosmosTileSchema.nullable().optional() })
              .catch({}),
          )
          .optional()
          .catch(undefined),
        meta: z
          .object({
            nextPageCursor: OptionalText,
            count: z.number().optional().catch(undefined),
          })
          .optional()
          .catch(undefined),
      })
      .nullable()
      .optional()
      .catch(undefined),
  })
  .catch({});

export type CosmosClustersData = z.infer<typeof CosmosClustersDataSchema>;
export type CosmosClusterConnectionsData = z.infer<
  typeof CosmosClusterConnectionsDataSchema
>;

export interface CosmosViewer {
  userId: string;
  handle: string;
  avatarUrl: string | null;
}

export function viewerFromMeData(data: CosmosMeData): CosmosViewer | null {
  const me = data.me;
  if (!me) return null;
  const userId = me.id === undefined ? null : String(me.id);
  const handle = handleFromUsername(me.username);
  if (!userId || !handle) return null;
  const avatar = me.avatarUrl;
  return {
    userId,
    handle,
    avatarUrl:
      avatar !== undefined && /^https?:\/\//i.test(avatar) ? avatar : null,
  };
}

export function handleFromMeData(data: CosmosMeData): string | null {
  return viewerFromMeData(data)?.handle ?? null;
}

export interface LibraryPage {
  entries: ListEntry[];
  nextPageCursor: string | null;
}

export interface CosmosCollection {
  id: string;
  name: string;
  slug?: string;
  ownerUsername?: string;
  itemCount: number | null;
}

export interface ClustersPage {
  collections: CosmosCollection[];
  nextPageCursor: string | null;
}

export function pageFromLibrary(data: CosmosLibraryData): LibraryPage {
  const list = data.allElementsV2;
  const entries: ListEntry[] = [];
  for (const tile of list?.items ?? []) {
    if (tile.id === undefined) continue;
    const sourceId = String(tile.id);
    const entry: ListEntry = {
      sourceId,
      url: tile.shareUrl ?? `https://www.cosmos.so/e/${sourceId}`,
    };
    if (tile.createdAt !== undefined) entry.savedAt = tile.createdAt;
    entries.push(entry);
  }

  return {
    entries,
    nextPageCursor: list?.meta?.nextPageCursor ?? null,
  };
}

export function pageFromClusterConnections(
  data: CosmosClusterConnectionsData,
): LibraryPage {
  const list = data.clusterConnections;
  const entries: ListEntry[] = [];
  for (const item of list?.items ?? []) {
    const tile = item.element;
    if (!tile?.id) continue;
    const sourceId = String(tile.id);
    const entry: ListEntry = {
      sourceId,
      url: tile.shareUrl ?? `https://www.cosmos.so/e/${sourceId}`,
    };
    if (tile.createdAt !== undefined) entry.savedAt = tile.createdAt;
    entries.push(entry);
  }
  return {
    entries,
    nextPageCursor: list?.meta?.nextPageCursor ?? null,
  };
}

export function pageFromClusters(data: CosmosClustersData): ClustersPage {
  const list = data.userClusters;
  const collections: CosmosCollection[] = [];
  for (const cluster of list?.items ?? []) {
    if (cluster.id === undefined || cluster.name === undefined) continue;
    collections.push({
      id: String(cluster.id),
      name: cluster.name,
      ...(cluster.slug ? { slug: cluster.slug } : {}),
      ...(cluster.owner?.username
        ? { ownerUsername: cluster.owner.username }
        : {}),
      itemCount: cluster.numberOfElements ?? null,
    });
  }
  return {
    collections,
    nextPageCursor: list?.meta?.nextPageCursor ?? null,
  };
}

function handleFromUsername(value: string | undefined): string | null {
  if (value === undefined) return null;
  const handle = value.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(handle)) return null;
  return handle;
}
