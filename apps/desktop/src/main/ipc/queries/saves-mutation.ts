import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { saves } from "@pond/schema/db";
import { EXTERNAL_SOURCE_IDS } from "@pond/schema/sources";
import type { Transaction } from "@pond/schema/tx";
import { classifyLibraryFile } from "@shared/file-format";
import { SavesDerivedPatchSchema } from "@shared/saves-contracts-shared";
import { decodeTextBytes } from "@shared/text-encoding";
import { eq, isNotNull, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { z } from "zod";
import { mediaEmbeddingVersion } from "../../../shared/embeddings";
import type { QueryResult } from "../../../shared/query-contracts";
import type { OkFailure } from "../../../shared/query-contracts-shared";
import { duplicateGroups } from "../../core/duplicate-groups";
import { executeBatch } from "../../core/executor";
import { extractImageMetadata } from "../../core/image-metadata";
import { extractMediaMetadata } from "../../core/media-metadata";
import { mergeDuplicateSaves } from "../../core/merge-duplicates";
import { persistSave } from "../../core/persist-save";
import { retryFailedSaves } from "../../core/pipeline/enqueue";
import { skipSaves } from "../../core/pipeline/reconciler-client";
import { runEnsurePoster } from "../../core/pipeline/workers/ensure-poster";
import { runRenderTextCover } from "../../core/pipeline/workers/render-text-cover";
import {
  findSavesMissingVideo,
  queueVideoDownloads,
  removeVideos,
} from "../../core/refresh/video-downloads";
import { replaceSaveFile } from "../../core/replace-file";
import { analyzeSaveColors } from "../../core/save-colors";
import { findSemanticDuplicateGroups } from "../../core/semantic-duplicates";
import { splitSave } from "../../core/split-save";
import { readLibraryMedia } from "../../core/storage/library-media-storage";
import { recordForUndo } from "../../core/undo";
import { knnVec, parseJsonVector, upsertVec } from "../../core/vec-index";
import { getDb } from "../../db";
import { saveFile } from "../../paths";
import {
  FlagParam,
  NullableStringParam,
  type QueryHandlerMap,
  query,
  StringListParam,
  StringParam,
} from "./params";

async function analyzeSaveMetadata(
  row: typeof saves.$inferSelect,
  force: boolean,
): Promise<boolean> {
  const file = row.files.find((entry) => {
    const mediaType = classifyLibraryFile(entry.path, entry.mimeType).mediaType;
    return ["image", "video", "audio"].includes(mediaType);
  });
  if (!file) return false;
  const mediaType = classifyLibraryFile(file.path, file.mimeType).mediaType;
  if (!force && row.metadataVersion === 1) return false;
  const path = saveFile(row.id, file.path);
  const metadata =
    mediaType === "image"
      ? await extractImageMetadata(path)
      : await extractMediaMetadata(path);
  if (Object.keys(metadata).length === 0) return false;
  await persistSave(
    row.id,
    { ...metadata, metadataVersion: 1 },
    {
      actorReason: force ? "metadata:reanalyze" : "metadata:backfill",
    },
  );
  return true;
}

const SAVE_NOT_FOUND: OkFailure = { ok: false, error: "Save not found." };

const SaveIdsParams = z.object({
  ids: z.array(StringParam).min(1).max(100_000),
});

const OptionalSourceParams = z.object({
  source: z.enum(EXTERNAL_SOURCE_IDS).optional(),
});

export const savesMutationQueries = {
  "saves.batchEditExtension": query(
    z.object({
      ids: z.array(StringParam).min(1).max(100_000),
      extension: z.string().trim().min(1).max(16),
    }),
    async (params) => {
      const { batchEditExtensions } = await import(
        "../../core/batch-extensions"
      );
      return batchEditExtensions(params);
    },
  ),
  async "saves.emptyTrash"() {
    const db = await getDb();
    const rows = await db
      .select()
      .from(saves)
      .where(isNotNull(saves.deletedAt));
    if (rows.length === 0) return { ok: true, count: 0 };
    const txs: Transaction[] = rows.map((row) => ({
      kind: "purge",
      model: "save",
      id: row.id,
      before: row,
      meta: { actor: "user", actorReason: "empty-trash" },
    }));
    await executeBatch(txs);
    for (const transaction of txs) recordForUndo(transaction);
    return { ok: true, count: txs.length };
  },

  async "saves.restoreAll"() {
    const db = await getDb();
    const rows = await db
      .select({ id: saves.id })
      .from(saves)
      .where(isNotNull(saves.deletedAt));
    if (rows.length === 0) return { ok: true, count: 0 };
    const txs: Transaction[] = rows.map((row) => ({
      kind: "untrash",
      model: "save",
      id: row.id,
      meta: { actor: "user", actorReason: "restore-all" },
    }));
    await executeBatch(txs);
    for (const transaction of txs) recordForUndo(transaction);
    return { ok: true, count: txs.length };
  },

  "saves.retryFailed": query(
    z.object({
      ids: z.array(z.coerce.string()).optional().catch(undefined),
    }),
    async (params) => {
      const requeued = await retryFailedSaves(params.ids?.filter(Boolean));
      return { ok: true as const, requeued };
    },
  ),

  "saves.skipIngest": query(
    z.object({
      ids: z.array(z.coerce.string()).min(1),
    }),
    async (params) => {
      const skipped = await skipSaves(params.ids.filter(Boolean));
      return { ok: true as const, skipped };
    },
  ),

  "saves.setPhash": query(
    z.object({ id: StringParam, phash: NullableStringParam }),
    async (params): Promise<QueryResult<"saves.setPhash">> => {
      if (!params.id) return SAVE_NOT_FOUND;
      await persistSave(
        params.id,
        { phash: params.phash },
        { actorReason: "duplicates:phash" },
      );
      return { ok: true };
    },
  ),

  "saves.setEmbedding": query(
    z.object({
      id: StringParam,
      embedding: z
        .array(z.union([z.number(), z.nan()]))
        .nullable()
        .catch(null),
      embeddingModel: NullableStringParam,
    }),
    async (params): Promise<QueryResult<"saves.setEmbedding">> => {
      if (!params.id) return SAVE_NOT_FOUND;
      const db = await getDb();
      await db
        .update(saves)
        .set({
          embedding: params.embedding,
          embeddingModel: params.embeddingModel,
        })
        .where(eq(saves.id, params.id));
      const vector = parseJsonVector(params.embedding);
      if (vector) upsertVec(db.$raw, "text", params.id, vector);
      return { ok: true };
    },
  ),

  "saves.patchDerived": query(
    z.object({ id: StringParam, patch: SavesDerivedPatchSchema.catch({}) }),
    async (params): Promise<QueryResult<"saves.patchDerived">> => {
      if (!params.id) return SAVE_NOT_FOUND;
      if (Object.keys(params.patch).length === 0)
        return { ok: false, error: "Nothing to update." };
      const updated = await persistSave(params.id, params.patch, {
        actorReason: "enrichment:derived",
      });
      if (!updated) return SAVE_NOT_FOUND;
      if (params.patch.clipEmbedding) {
        const db = await getDb();
        const vector = parseJsonVector(params.patch.clipEmbedding);
        if (vector) upsertVec(db.$raw, "clip", params.id, vector);
      }
      return { ok: true };
    },
  ),

  async "saves.backfillColors"() {
    const db = await getDb();
    const rows = await db.select().from(saves);

    let updated = 0;
    for (const row of rows) if (await analyzeSaveColors(row, false)) updated++;
    return { ok: true as const, updated };
  },

  async "saves.backfillMetadata"() {
    const db = await getDb();
    const rows = await db.select().from(saves);
    let updated = 0;
    for (const row of rows)
      if (await analyzeSaveMetadata(row, false)) updated++;
    return { ok: true as const, updated };
  },

  "saves.reanalyzeColors": query(
    z.object({ id: StringParam }),
    async ({ id }): Promise<QueryResult<"saves.reanalyzeColors">> => {
      const db = await getDb();
      const row = db.select().from(saves).where(eq(saves.id, id)).get();
      if (!row) return SAVE_NOT_FOUND;
      const updated = await analyzeSaveColors(row, true);
      return updated
        ? { ok: true, updated }
        : { ok: false, error: "Couldn't read colors from this Save." };
    },
  ),

  "saves.setPrimaryColor": query(
    z.object({
      id: StringParam,
      color: z
        .string()
        .regex(/^#[0-9a-f]{6}$/i)
        .nullable(),
    }),
    async ({ id, color }): Promise<QueryResult<"saves.setPrimaryColor">> => {
      const db = await getDb();
      const row = db.select().from(saves).where(eq(saves.id, id)).get();
      if (!row) return SAVE_NOT_FOUND;
      const primaryColor = color?.toLowerCase() ?? null;
      if (
        primaryColor &&
        !(row.dominantColors ?? []).some(
          (candidate) => candidate.toLowerCase() === primaryColor,
        )
      )
        return { ok: false, error: "Choose one of this Save's colors." };
      await persistSave(
        id,
        { primaryColor },
        { actorReason: "color:set-primary" },
      );
      return { ok: true };
    },
  ),

  "saves.convertTextEncoding": query(
    z.object({ id: StringParam, fileIndex: z.number().int().nonnegative() }),
    async ({
      id,
      fileIndex,
    }): Promise<QueryResult<"saves.convertTextEncoding">> => {
      const db = await getDb();
      const row = db.select().from(saves).where(eq(saves.id, id)).get();
      const file = row?.files[fileIndex];
      if (
        !file ||
        classifyLibraryFile(file.path, file.mimeType).mediaType !== "text"
      )
        return { ok: false, error: "This Save has no text file." };
      const bytes = await readLibraryMedia(saveFile(id, file.path));
      const decoded = decodeTextBytes(bytes);
      if (decoded.encoding === "utf-8" && !decoded.hadBom)
        return { ok: true, updated: false };
      const directory = await mkdtemp(join(tmpdir(), "pond-text-"));
      const path = join(directory, basename(file.path));
      try {
        await writeFile(path, decoded.text, "utf8");
        const result = await replaceSaveFile({ id, sourcePath: path });
        return result.ok ? { ok: true, updated: true } : result;
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  ),

  "saves.regeneratePoster": query(
    z.object({ id: StringParam }),
    async ({ id }) => {
      await runEnsurePoster(id, { force: true });
      return { ok: true };
    },
  ),

  "saves.downloadVideo": query(SaveIdsParams, async ({ ids }) => ({
    ok: true as const,
    queued: await queueVideoDownloads(ids, { interactive: true }),
  })),

  "saves.removeVideo": query(SaveIdsParams, async ({ ids }) => ({
    ok: true as const,
    removed: await removeVideos(ids),
  })),

  "saves.missingVideoCount": query(
    OptionalSourceParams,
    async ({ source }) => ({
      count: (await findSavesMissingVideo(source)).length,
    }),
  ),

  "saves.downloadMissingVideos": query(
    OptionalSourceParams,
    async ({ source }) => ({
      ok: true as const,
      queued: await queueVideoDownloads(await findSavesMissingVideo(source), {
        interactive: false,
      }),
    }),
  ),

  "saves.ensureTextCover": query(
    z.object({ id: StringParam, force: FlagParam.default(false) }),
    async (params) => {
      if (!params.id) return SAVE_NOT_FOUND;
      const captured = await runRenderTextCover(params.id, {
        force: params.force,
      });
      return { ok: true as const, captured };
    },
  ),

  "saves.findDuplicates": query(
    z.object({
      visualDistance: z.number().int().min(0).max(64).optional(),
    }),
    async (params) => {
      const db = await getDb();
      const rows = await db
        .select({
          id: saves.id,
          title: saves.title,
          phash: saves.phash,
          files: saves.files,
          status: saves.status,
          clipEmbedding: saves.clipEmbedding,
          clipModel: saves.clipModel,
        })
        .from(saves)
        .where(isNull(saves.deletedAt));
      const base = duplicateGroups(rows, {
        visualDistance: params.visualDistance,
      });
      const excludedPairs: Array<[string, string]> = [];
      for (const group of base.groups) {
        for (let left = 0; left < group.ids.length; left++) {
          for (let right = left + 1; right < group.ids.length; right++) {
            const leftId = group.ids[left];
            const rightId = group.ids[right];
            if (leftId && rightId) excludedPairs.push([leftId, rightId]);
          }
        }
      }
      const semantic = findSemanticDuplicateGroups(
        rows.map((row) => ({
          id: row.id,
          vector: parseJsonVector(row.clipEmbedding),
          model: row.clipModel,
          status: row.status,
        })),
        {
          neighbors: (vector, limit) => knnVec(db.$raw, "clip", vector, limit),
        },
        { model: mediaEmbeddingVersion(), excludedPairs },
      );
      return { ...base, groups: [...base.groups, ...semantic] };
    },
  ),

  "saves.mergeDuplicates": query(
    z.object({ keepId: StringParam, ids: StringListParam }),
    async (params) => mergeDuplicateSaves(params),
  ),

  "saves.split": query(
    z.object({ ids: z.array(StringParam).min(1).max(1_000) }),
    async ({ ids }): Promise<QueryResult<"saves.split">> => {
      let split = 0;
      let created = 0;
      let failed = false;
      for (const id of ids) {
        const result = await splitSave(id, "user").catch((err) => {
          log.warn("[pond split] split failed", id, err);
          failed = true;
          return null;
        });
        if (!result?.ok) continue;
        split += 1;
        created += result.created.length;
      }
      if (split > 0) return { ok: true, split, created };
      return {
        ok: false,
        error: failed
          ? "Couldn't copy the files out of this Save. It's unchanged, so try again."
          : "These Saves have one image or video each.",
      };
    },
  ),
} satisfies QueryHandlerMap;
