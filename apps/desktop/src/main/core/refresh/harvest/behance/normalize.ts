import { z } from "zod";
import type { ListEntry } from "../list-types";

const CoverSchema = z.object({ url: z.string() }).nullish().catch(undefined);

const ProjectNodeSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  name: z.string().optional().catch(undefined),
  url: z.string().optional().catch(undefined),
  publishedOn: z.number().optional().catch(undefined),
  covers: z
    .object({ size_original: CoverSchema, size_808: CoverSchema })
    .partial()
    .nullish()
    .catch(undefined),
  owners: z
    .array(
      z.object({
        username: z.string(),
        displayName: z.string().optional().catch(undefined),
      }),
    )
    .catch([]),
});

const EdgeSchema = z.object({
  cursor: z.string().optional().catch(undefined),
  node: ProjectNodeSchema.nullable().catch(null),
});

export type BehanceEdge = z.infer<typeof EdgeSchema>;

export const AppreciatedSchema = z.object({
  user: z
    .object({
      appreciatedProjects: z.object({
        pageInfo: z.object({
          endCursor: z.string().nullish().catch(null),
          hasNextPage: z.boolean().catch(false),
        }),
        edges: z.array(EdgeSchema).catch([]),
      }),
    })
    .nullish(),
});

export const ViewerSchema = z.object({
  viewer: z.object({ username: z.string() }).nullish(),
});

/** The edge cursor is base64 of the appreciation time, written in UTC without a zone. */
export function appreciatedAt(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  const text = Buffer.from(cursor, "base64").toString("utf8");
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return undefined;
  const at = new Date(`${text.replace(" ", "T")}Z`);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

export function appreciationEntry(edge: BehanceEdge): ListEntry | null {
  const node = edge.node;
  if (!node) return null;
  const entry: ListEntry = {
    sourceId: node.id,
    url: node.url ?? `https://www.behance.net/gallery/${node.id}/a`,
    listKinds: ["liked"],
  };
  const savedAt = appreciatedAt(edge.cursor);
  if (savedAt) entry.savedAt = savedAt;
  if (node.name) entry.title = node.name;
  const owner = node.owners[0];
  if (owner) entry.author = owner.displayName ?? owner.username;
  const cover = node.covers?.size_original?.url ?? node.covers?.size_808?.url;
  if (cover) {
    entry.mediaUrl = cover;
    entry.mediaUrls = [{ url: cover, type: "image" }];
    entry.mediaType = "image";
  } else {
    entry.mediaType = "link";
  }
  return entry;
}
