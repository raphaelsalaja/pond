import { saves, tags } from "@pond/schema/db";
import { tagsEmpty } from "@pond/schema/filters/fields";
import { FIELD_IDS } from "@pond/schema/filters/meta";
import {
  and,
  count,
  desc,
  eq,
  isNotNull,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { IPC } from "../../../shared/constants";
import { getDb } from "../../db";
import { broadcast } from "../../lib/broadcast";
import { folderIdsForSave, listFolders } from "../folders";
import {
  type LibraryRetrievalScope,
  libraryRetrievalInput,
  libraryScopeClauses,
  retrieveLibrary,
  toFtsMatchQuery,
} from "../library-retrieval";
import { getPrefs } from "../prefs";

export const searchLibraryInput = libraryRetrievalInput;

export const readSaveInput = z.object({
  id: z.string(),
  field: z
    .enum(["caption", "ocr", "transcript", "notes", "description"])
    .optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(8000).optional(),
});

export const grepLibraryInput = z.object({
  query: z.string().trim().min(1).max(200),
  id: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const FILTER_FIELD = z.enum(FIELD_IDS);
const FILTER_OPERATOR = z.enum([
  "eq",
  "neq",
  "in",
  "nin",
  "lt",
  "lte",
  "gt",
  "gte",
  "between",
  "contains",
  "startsWith",
  "endsWith",
  "some",
  "every",
  "none",
  "exists",
  "empty",
  "near",
]);
const filterValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.object({ hex: z.string(), tolerance: z.number() }),
]);
const filterPredicate = z.object({
  field: FILTER_FIELD,
  operator: FILTER_OPERATOR,
  value: filterValue.nullable().default(null),
  negate: z.boolean().optional(),
});
export const filterGroup = z.object({
  combinator: z.enum(["and", "or"]),
  not: z.boolean().optional(),
  rules: z.array(
    z.union([
      filterPredicate,
      z.object({
        combinator: z.enum(["and", "or"]),
        not: z.boolean().optional(),
        rules: z.array(filterPredicate),
      }),
    ]),
  ),
});

export const applyFilterInput = z.object({
  query: filterGroup,
});

export const setOverlayInput = z.object({
  semanticQuery: z.string().nullable().optional(),
  visualSaveId: z.string().nullable().optional(),
});

export const citeSavesInput = z.object({
  ids: z.array(z.string()).min(1).max(80),
});

export const listFoldersInput = z.object({});

export const openSaveInput = z.object({
  id: z.string(),
});

export const libraryOverviewInput = z.object({});

export const describeSavesInput = z.object({
  ids: z.array(z.string()).min(1).max(24),
});

export const findDuplicatesInput = z.object({});

export type LibraryScope = LibraryRetrievalScope;

const emptySnippet = z
  .string()
  .nullable()
  .transform((value) => value ?? "");

const GrepRowsSchema = z.array(
  z.object({
    id: z.string(),
    title: emptySnippet,
    description: emptySnippet,
    caption: emptySnippet,
    ocr: emptySnippet,
    transcript: emptySnippet,
    notes: emptySnippet,
  }),
);

export const toolDependencies = {
  retrieveLibrary,
  async readRows(condition: SQL | undefined) {
    const db = await getDb();
    return await db
      .select({
        id: saves.id,
        title: saves.title,
        url: saves.url,
        author: saves.author,
        source: saves.source,
        description: saves.description,
        notes: saves.notes,
        tags: saves.tags,
        caption: saves.caption,
        ocrText: saves.ocrText,
        transcript: saves.transcript,
        rating: saves.rating,
        favorite: saves.favorite,
        mediaType: saves.mediaType,
        width: saves.width,
        height: saves.height,
      })
      .from(saves)
      .where(condition)
      .limit(1);
  },
  async grepRows(match: string, id: string | undefined, limit: number) {
    const db = await getDb();
    const idClause = id ? "AND f.id = ?" : "";
    const params = id ? [match, id, limit] : [match, limit];
    return db.$raw
      .prepare(
        `SELECT f.id AS id,
              snippet(saves_fts, 1, '', '', '…', 16) AS title,
              snippet(saves_fts, 2, '', '', '…', 24) AS description,
              snippet(saves_fts, 5, '', '', '…', 24) AS caption,
              snippet(saves_fts, 6, '', '', '…', 24) AS ocr,
              snippet(saves_fts, 7, '', '', '…', 24) AS transcript,
              snippet(saves_fts, 8, '', '', '…', 24) AS notes
       FROM saves_fts f
       JOIN saves s ON s.id = f.id
       WHERE saves_fts MATCH ? AND s.deleted_at IS NULL ${idClause}
       LIMIT ?`,
      )
      .all(...params);
  },
  async admittedIds(condition: SQL | undefined) {
    const db = await getDb();
    return await db.select({ id: saves.id }).from(saves).where(condition);
  },
  folderIdsForSave,
};

export async function searchLibrary(
  input: z.infer<typeof searchLibraryInput>,
  scope: LibraryScope = {},
  deps = toolDependencies,
) {
  const boundedInput =
    input.limit !== undefined && input.limit > 40
      ? { ...input, limit: 40 }
      : input;
  const result = await deps.retrieveLibrary(boundedInput, scope);
  return { saves: result.saves };
}

async function sliceTokens(text: string, offset = 0, limit = 2000) {
  const { encode, decode } = await import("gpt-tokenizer");
  const tokens = encode(text);
  const start = Math.min(offset, tokens.length);
  const slice = tokens.slice(start, start + limit);
  return {
    text: decode(slice),
    offset: start,
    length: slice.length,
    total: tokens.length,
  };
}

export async function readSave(
  input: z.infer<typeof readSaveInput>,
  scope: LibraryScope = {},
  deps = toolDependencies,
) {
  const rows = await deps.readRows(
    and(eq(saves.id, input.id), ...libraryScopeClauses(scope)),
  );
  const row = rows[0];
  if (!row) return { error: "Save not found." };
  const fields = {
    description: row.description ?? "",
    notes: row.notes ?? "",
    caption: row.caption ?? "",
    ocr: row.ocrText ?? "",
    transcript: row.transcript ?? "",
  };
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 2000;
  if (input.field) {
    const window = await sliceTokens(fields[input.field], offset, limit);
    return {
      save: {
        id: row.id,
        title: row.title,
        url: row.url,
        author: row.author,
        source: row.source,
        field: input.field,
        ...window,
      },
    };
  }
  const [description, notes, caption, ocr, transcript] = await Promise.all([
    sliceTokens(fields.description, 0, 800),
    sliceTokens(fields.notes, 0, 800),
    sliceTokens(fields.caption, 0, 800),
    sliceTokens(fields.ocr, 0, 800),
    sliceTokens(fields.transcript, 0, 800),
  ]);
  return {
    save: {
      id: row.id,
      title: row.title,
      url: row.url,
      author: row.author,
      source: row.source,
      description: description.text,
      descriptionTokens: description.total,
      notes: notes.text,
      notesTokens: notes.total,
      caption: caption.text,
      captionTokens: caption.total,
      ocr: ocr.text,
      ocrTokens: ocr.total,
      transcript: transcript.text,
      transcriptTokens: transcript.total,
      rating: row.rating,
      favorite: row.favorite,
      tags: row.tags,
      folderIds: await deps.folderIdsForSave(row.id),
      mediaType: row.mediaType,
      width: row.width,
      height: row.height,
    },
  };
}

export async function grepLibrary(
  input: z.infer<typeof grepLibraryInput>,
  scope: LibraryScope = {},
  deps = toolDependencies,
) {
  const match = toFtsMatchQuery(input.query);
  if (!match) return { hits: [] };
  /** SQLite snippet() returns null for columns that did not match. */
  const rows = GrepRowsSchema.parse(
    await deps.grepRows(match, input.id, input.limit ?? 20),
  );
  const admitted = rows.length
    ? new Set(
        (
          await deps.admittedIds(
            and(
              ...libraryScopeClauses(scope),
              sql`${saves.id} IN (${sql.join(
                rows.map((row) => sql`${row.id}`),
                sql`, `,
              )})`,
            ),
          )
        ).map((row) => row.id),
      )
    : new Set<string>();
  return {
    hits: rows
      .filter((row) => admitted.has(row.id))
      .map((row) => ({
        id: row.id,
        snippets: [
          row.title,
          row.description,
          row.caption,
          row.ocr,
          row.transcript,
          row.notes,
        ].filter((value) => value && !value.includes("\uFFFD")),
      })),
  };
}

function countOf(row?: { n?: unknown }) {
  const value = Number(row?.n ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export async function libraryOverview() {
  const db = await getDb();
  const prefs = await getPrefs();
  const active = isNull(saves.deletedAt);
  const [saveCount] = await db.select({ n: count() }).from(saves).where(active);
  const [trashCount] = await db
    .select({ n: count() })
    .from(saves)
    .where(isNotNull(saves.deletedAt));
  const [textCount] = await db
    .select({ n: count() })
    .from(saves)
    .where(and(active, isNotNull(saves.embeddingModel)));
  const [clipCount] = await db
    .select({ n: count() })
    .from(saves)
    .where(and(active, isNotNull(saves.clipModel)));
  const [tagCount] = await db.select({ n: count() }).from(tags);
  const [untaggedCount] = await db
    .select({ n: count() })
    .from(saves)
    .where(and(active, tagsEmpty()));
  const [untitledCount] = await db
    .select({ n: count() })
    .from(saves)
    .where(and(active, or(isNull(saves.title), eq(saves.title, ""))));
  const [unfiledCount] = await db
    .select({ n: count() })
    .from(saves)
    .where(
      and(
        active,
        sql`not exists (select 1 from save_folders where save_id = ${saves.id})`,
      ),
    );
  const folders = await listFolders();
  const tagRows = await db
    .select({ name: tags.name, usageCount: tags.usageCount })
    .from(tags)
    .orderBy(desc(tags.usageCount))
    .limit(12);
  const sources = await db
    .select({ source: saves.source, n: count() })
    .from(saves)
    .where(active)
    .groupBy(saves.source)
    .orderBy(desc(count()))
    .limit(12);
  return {
    saves: countOf(saveCount),
    trash: countOf(trashCount),
    folders: folders.length,
    tags: countOf(tagCount),
    messy: {
      untagged: countOf(untaggedCount),
      untitled: countOf(untitledCount),
      unfiled: countOf(unfiledCount),
    },
    topFolders: folders.slice(0, 12).map((folder) => ({
      id: folder.id,
      name: folder.name,
    })),
    topTags: tagRows,
    topSources: sources.map((row) => ({
      source: row.source,
      n: countOf(row),
    })),
    index: {
      semanticSearch: prefs.ai.semanticSearch === true,
      enableClip: prefs.ai.enableClip === true,
      textVectors: countOf(textCount),
      clipVectors: countOf(clipCount),
    },
  };
}

export async function applyFilter(
  input: z.infer<typeof applyFilterInput>,
  emit = broadcast,
) {
  emit(IPC.agentFilter, input.query);
  return { ok: true };
}

export async function setOverlay(
  input: z.infer<typeof setOverlayInput>,
  emit = broadcast,
) {
  emit(IPC.agentOverlay, input);
  return { ok: true };
}

export async function citeSaves(input: z.infer<typeof citeSavesInput>) {
  broadcast(IPC.agentCite, input.ids);
  return { ok: true, ids: input.ids };
}

export async function listLibraryFolders() {
  const folders = await listFolders();
  return {
    folders: folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
    })),
  };
}

export async function openSave(input: z.infer<typeof openSaveInput>) {
  broadcast(IPC.nav, `/save/${input.id}`);
  return { ok: true };
}

export async function describeSaves(input: z.infer<typeof describeSavesInput>) {
  const { imagesForSaves } = await import("./vision");
  const images = await imagesForSaves(input.ids);
  if (!images.length) {
    return {
      error:
        "No image files for these Saves. Attach photos or pick a vision-capable model.",
    };
  }
  return {
    ids: input.ids,
    images: images.length,
    message:
      "Pixels for these Saves are in this turn. Propose titles and tags with proposeChanges.",
  };
}

export async function findDuplicateSaves() {
  const db = await getDb();
  const rows = await db
    .select({
      id: saves.id,
      title: saves.title,
      phash: saves.phash,
      files: saves.files,
    })
    .from(saves)
    .where(isNull(saves.deletedAt));
  const byHash = new Map<string, string[]>();
  for (const row of rows) {
    const file = row.files?.[0];
    const key = file?.sha256 || row.phash;
    if (!key) continue;
    const list = byHash.get(key) ?? [];
    list.push(row.id);
    byHash.set(key, list);
  }
  return {
    groups: [...byHash.values()]
      .filter((ids) => ids.length > 1)
      .slice(0, 40)
      .map((ids) => ({ ids })),
  };
}
