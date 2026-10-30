import {
  MEDIA_TYPES,
  type MediaType,
  SOURCES,
  type Source,
  saves,
} from "@pond/schema/db";
import { buildWhere, type Query } from "@pond/schema/filters";
import { and, desc, eq, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";
import log from "electron-log/main.js";
import { z } from "zod";
import type { LibraryQueryRequest } from "../../shared/library-query";
import { type Db, getDb } from "../db";
import { compileKeywordWhere, toFtsMatchQuery } from "./keyword-query";
import { libraryQueryWhere } from "./library-query";
import {
  EMBEDDING_QUERY_TASKS,
  encodeQueryEmbeddings,
  type QueryEmbeddings,
  reciprocalRankFusion,
  type VersionedVector,
} from "./query-embeddings";
import { knnVec, parseJsonVector } from "./vec-index";

const mediaProbe = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("saveId"), id: z.string().min(1) }),
  z.object({
    kind: z.literal("vector"),
    model: z.string().min(1),
    values: z.array(z.number()).min(1),
  }),
]);

export const libraryRetrievalInput = z.object({
  query: z.string().optional(),
  source: z
    .enum(SOURCES)
    .optional()
    .describe("Only Saves from this platform. Omit unless asked for one."),
  folderId: z
    .string()
    .optional()
    .describe("A folder id from listFolders. Omit to search every folder."),
  media: z.array(z.enum(MEDIA_TYPES)).max(MEDIA_TYPES.length).optional(),
  untagged: z.boolean().optional().describe("Only Saves with no tags."),
  limit: z.number().int().min(1).max(500).optional(),
  task: z.enum(EMBEDDING_QUERY_TASKS).optional(),
  visual: mediaProbe.optional(),
});

export type LibraryRetrievalInput = z.infer<typeof libraryRetrievalInput>;

export interface LibraryRetrievalScope {
  saveIds?: string[];
  folderId?: string;
  libraryQuery?: LibraryQueryRequest;
  filter?: Query;
}

export type RetrievalChannel = "fts" | "text" | "media" | "recent";

export interface LibraryRetrievalHit {
  id: string;
  title: string | null;
  url: string;
  author: string | null;
  source: Source;
  notes: string | null;
  description: string | null;
  mediaType: MediaType | null;
  savedAt: Date;
  score: number;
  channels: RetrievalChannel[];
}

export interface LibraryRetrievalResult {
  hits: LibraryRetrievalHit[];
  saves: Array<
    Pick<
      LibraryRetrievalHit,
      "id" | "title" | "url" | "author" | "source" | "notes" | "description"
    >
  >;
}

export { toFtsMatchQuery } from "./keyword-query";

export function normalizeMedia(media: MediaType[] | undefined): MediaType[] {
  return [...new Set(media ?? [])];
}

export function libraryScopeClauses(scope: LibraryRetrievalScope): SQL[] {
  const scoped = scope.libraryQuery
    ? libraryQueryWhere(scope.libraryQuery)
    : undefined;
  const clauses: SQL[] = scoped ? [scoped] : [isNull(saves.deletedAt)];
  if (scope.saveIds) clauses.push(inArray(saves.id, scope.saveIds));
  if (scope.folderId) {
    const compiled = buildWhere({
      combinator: "and",
      rules: [{ field: "folder", operator: "some", value: [scope.folderId] }],
    });
    if (compiled) clauses.push(compiled);
  }
  if (scope.filter) {
    const compiled = buildWhere(scope.filter);
    if (compiled) clauses.push(compiled);
  }
  return clauses;
}

function inputClauses(input: LibraryRetrievalInput): SQL[] {
  const clauses: SQL[] = [];
  if (input.source) clauses.push(eq(saves.source, input.source));
  if (input.folderId) {
    const folderQuery: Query = {
      combinator: "and",
      rules: [{ field: "folder", operator: "some", value: [input.folderId] }],
    };
    const compiled = buildWhere(folderQuery);
    if (compiled) clauses.push(compiled);
  }
  const media = normalizeMedia(input.media);
  if (media.length) {
    const projectedType = sql<string>`case when ${saves.source} = 'web' then 'link' else lower(coalesce(${saves.mediaType}, '')) end`;
    clauses.push(inArray(projectedType, media));
  }
  if (input.untagged)
    clauses.push(sql`json_array_length(coalesce(${saves.tags}, '[]')) = 0`);
  return clauses;
}

const projection = {
  id: saves.id,
  title: saves.title,
  url: saves.url,
  author: saves.author,
  source: saves.source,
  notes: saves.notes,
  description: saves.description,
  mediaType: saves.mediaType,
  savedAt: saves.savedAt,
};

function publicSaves(
  hits: LibraryRetrievalHit[],
): LibraryRetrievalResult["saves"] {
  return hits.map(({ id, title, url, author, source, notes, description }) => ({
    id,
    title,
    url,
    author,
    source,
    notes,
    description,
  }));
}

function knnLimit(limit: number): number {
  return Math.max(limit * 8, 200);
}

export type RetrievalRecord = Omit<LibraryRetrievalHit, "score" | "channels">;
export interface RetrievalStore {
  records(
    condition: SQL | undefined,
    recentLimit?: number,
  ): Promise<RetrievalRecord[]>;
  admittedIds(condition: SQL | undefined): Promise<Array<{ id: string }>>;
  lexicalCandidates(
    query: string,
    limit: number,
    condition?: SQL,
  ): Array<{ id: string; rank: number }>;
  neighbors(
    kind: "text" | "media",
    vector: number[],
    limit: number,
    condition?: SQL,
  ): Array<{ id: string; distance: number }>;
}

const LexicalCandidatesSchema = z.array(
  z.object({ id: z.string(), rank: z.number() }),
);

function retrievalStore(db: Db): RetrievalStore {
  return {
    async records(condition, recentLimit) {
      const query = db.select(projection).from(saves).where(condition);
      return recentLimit === undefined
        ? await query
        : await query.orderBy(desc(saves.savedAt)).limit(recentLimit);
    },
    async admittedIds(condition) {
      return await db.select({ id: saves.id }).from(saves).where(condition);
    },
    lexicalCandidates(query, limit, condition) {
      let match: string | null = null;
      try {
        match = toFtsMatchQuery(query);
      } catch {
        compileKeywordWhere(query);
      }
      if (!match) {
        return db
          .select({ id: saves.id, rank: sql<number>`0` })
          .from(saves)
          .where(and(condition, compileKeywordWhere(query)))
          .orderBy(desc(saves.savedAt))
          .limit(limit)
          .all();
      }
      return LexicalCandidatesSchema.parse(
        db
          .select({ id: saves.id, rank: sql<number>`bm25(saves_fts)` })
          .from(sql`saves_fts`)
          .innerJoin(saves, sql`${saves.id} = saves_fts.id`)
          .where(and(condition, sql`saves_fts match ${match}`))
          .orderBy(sql`bm25(saves_fts)`)
          .limit(limit)
          .all(),
      );
    },
    neighbors(kind, vector, limit, condition) {
      if (!condition) {
        return knnVec(
          db.$raw,
          kind === "text" ? "text" : "clip",
          vector,
          limit,
        );
      }
      const column = kind === "text" ? saves.embedding : saves.clipEmbedding;
      const distance = sql<number>`vec_distance_cosine(${column}, ${JSON.stringify(vector)})`;
      return db
        .select({ id: saves.id, distance })
        .from(saves)
        .where(
          and(
            condition,
            sql`${column} is not null`,
            sql`json_array_length(${column}) = ${vector.length}`,
          ),
        )
        .orderBy(distance)
        .limit(limit)
        .all();
    },
  };
}

async function denseChannel(
  store: RetrievalStore,
  kind: "text" | "media",
  vector: VersionedVector,
  clauses: SQL[],
  limit: number,
): Promise<string[]> {
  const ids = store
    .neighbors(
      kind,
      vector.vector,
      knnLimit(limit),
      and(
        ...clauses,
        eq(
          kind === "text" ? saves.embeddingModel : saves.clipModel,
          vector.model,
        ),
      ),
    )
    .map((hit) => hit.id);
  if (!ids.length) return [];
  const modelColumn = kind === "text" ? saves.embeddingModel : saves.clipModel;
  const rows = await store.admittedIds(
    and(...clauses, eq(modelColumn, vector.model), inArray(saves.id, ids)),
  );
  const admitted = new Set(rows.map((row) => row.id));
  return ids.filter((id) => admitted.has(id));
}

async function resolveMediaProbe(
  db: Db,
  probe: z.infer<typeof mediaProbe> | undefined,
): Promise<VersionedVector | undefined> {
  if (!probe) return undefined;
  if (probe.kind === "vector") {
    return { model: probe.model, vector: probe.values };
  }
  const rows = await db
    .select({
      clipEmbedding: saves.clipEmbedding,
      clipModel: saves.clipModel,
    })
    .from(saves)
    .where(eq(saves.id, probe.id))
    .limit(1);
  const row = rows[0];
  const vector = parseJsonVector(row?.clipEmbedding);
  if (!vector || !row?.clipModel) return undefined;
  return { model: row.clipModel, vector };
}

export async function retrieveLibraryWithDb(
  db: Db,
  input: LibraryRetrievalInput,
  scope: LibraryRetrievalScope = {},
  queryEmbeddings: QueryEmbeddings = {},
): Promise<LibraryRetrievalResult> {
  return retrieveLibraryWithStore(
    retrievalStore(db),
    input,
    scope,
    queryEmbeddings,
  );
}

export async function retrieveLibraryWithStore(
  store: RetrievalStore,
  input: LibraryRetrievalInput,
  scope: LibraryRetrievalScope = {},
  queryEmbeddings: QueryEmbeddings = {},
): Promise<LibraryRetrievalResult> {
  const limit = input.limit ?? 12;
  const clauses = [...libraryScopeClauses(scope), ...inputClauses(input)];
  const excludedId = input.visual?.kind === "saveId" ? input.visual.id : null;
  if (excludedId) clauses.push(ne(saves.id, excludedId));
  const query = input.query?.trim() ?? "";
  const match = compileKeywordWhere(query);
  const hasDense = Boolean(queryEmbeddings.text || queryEmbeddings.media);
  if (!match && !hasDense) {
    const rows = await store.records(and(...clauses), limit);
    const hits = rows
      .filter((row) => row.id !== excludedId)
      .slice(0, limit)
      .map((row, index) => ({
        ...row,
        score: 1 / (index + 1),
        channels: ["recent" as const],
      }));
    return { hits, saves: publicSaves(hits) };
  }

  const ranked: Array<{ channel: RetrievalChannel; ids: string[] }> = [];
  if (match) {
    const candidates = store.lexicalCandidates(
      query,
      Math.max(limit * 8, 50),
      and(...clauses),
    );
    if (candidates.length) {
      const rows = await store.admittedIds(
        and(
          ...clauses,
          inArray(
            saves.id,
            candidates.map((row) => row.id),
          ),
        ),
      );
      const admitted = new Set(rows.map((row) => row.id));
      ranked.push({
        channel: "fts",
        ids: candidates
          .map((candidate) => candidate.id)
          .filter((id) => admitted.has(id)),
      });
    }
  }

  if (queryEmbeddings.text) {
    const ids = await denseChannel(
      store,
      "text",
      queryEmbeddings.text,
      clauses,
      limit,
    );
    if (ids.length) ranked.push({ channel: "text", ids });
  }
  if (queryEmbeddings.media) {
    const ids = await denseChannel(
      store,
      "media",
      queryEmbeddings.media,
      clauses,
      limit,
    );
    if (ids.length) ranked.push({ channel: "media", ids });
  }

  const channelById = new Map<string, RetrievalChannel[]>();
  for (const list of ranked) {
    for (const id of list.ids) {
      const channels = channelById.get(id) ?? [];
      if (!channels.includes(list.channel)) channels.push(list.channel);
      channelById.set(id, channels);
    }
  }
  const fused = reciprocalRankFusion(ranked.map((list) => list.ids))
    .filter((row) => row.id !== excludedId)
    .slice(0, Math.max(limit * 4, 50));
  if (!fused.length) return { hits: [], saves: [] };
  const rows = await store.records(
    and(
      ...clauses,
      inArray(
        saves.id,
        fused.map((row) => row.id),
      ),
    ),
  );
  const records = new Map(rows.map((row) => [row.id, row] as const));
  const hits = fused
    .flatMap(({ id, score }) => {
      const row = records.get(id);
      return row
        ? [{ ...row, score, channels: channelById.get(id) ?? [] }]
        : [];
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.savedAt.getTime() - left.savedAt.getTime(),
    )
    .slice(0, limit);
  return { hits, saves: publicSaves(hits) };
}

export async function retrieveLibrary(
  input: LibraryRetrievalInput,
  scope: LibraryRetrievalScope = {},
): Promise<LibraryRetrievalResult> {
  const startedAt = Date.now();
  const db = await getDb();
  let embeddings: QueryEmbeddings = {};
  if (input.query?.trim()) {
    try {
      embeddings = await encodeQueryEmbeddings(
        input.query,
        normalizeMedia(input.media),
        undefined,
        input.task,
      );
    } catch (error) {
      log.warn("[pond retrieval] dense query encoding unavailable", {
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
  try {
    const media = await resolveMediaProbe(db, input.visual);
    if (media) embeddings = { ...embeddings, media };
  } catch (error) {
    log.warn("[pond retrieval] media probe unavailable", {
      error: error instanceof Error ? error.message : "unknown error",
    });
  }
  const result = await retrieveLibraryWithDb(db, input, scope, embeddings);
  log.info("[pond retrieval] complete", {
    queryLength: input.query?.trim().length ?? 0,
    media: normalizeMedia(input.media),
    hits: result.hits.length,
    channels: [...new Set(result.hits.flatMap((hit) => hit.channels))],
    denseText: Boolean(embeddings.text),
    denseMedia: Boolean(embeddings.media),
    ms: Date.now() - startedAt,
  });
  return result;
}
