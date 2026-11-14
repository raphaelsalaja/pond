import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import {
  API_THUMBNAIL_SIZES,
  ApiEditFoldersRequestSchema,
  ApiEditTagsRequestSchema,
  ApiFavoriteRequestSchema,
  ApiNoteRequestSchema,
  ApiRatingRequestSchema,
  ApiSaveIdsRequestSchema,
  type ApiSaveState,
  ApiSavesGetParamsSchema,
  type ApiSaveText,
  type ApiThumbnailSize,
} from "@pond/schema/api";
import { folders, type SaveFile, SOURCES, saves, tasks } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import { pickCardFile } from "@shared/save-file-names";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import mime from "mime-types";
import { z } from "zod";
import type { BulkEdit } from "../../shared/bulk-contracts";
import { readLibraryMedia } from "../core/storage/library-media-storage";
import { getOrCreateThumbnail } from "../core/thumbnail";
import { PondError } from "../lib/pond-error";
import { saveFile } from "../paths";
import { type ApiRuntime, apiRuntime, requireLibrary } from "./api-runtime";
import { apiSavesByIds, requireSaves, selectApiSaves } from "./api-saves";
import { apiError, handleApiError, invalidRequest } from "./errors";

const IMAGE_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
]);

const THUMBNAIL_WIDTHS = { small: 160, medium: 480, large: 1024 } as const;

const IdQuerySchema = z.object({
  id: z.string().min(1),
  libraryId: z.string().optional(),
});

function queryParams(c: Context) {
  return Object.fromEntries(new URL(c.req.url).searchParams.entries());
}

async function readParams(c: Context): Promise<JsonValue> {
  if (c.req.method !== "POST") return queryParams(c);
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

function idQuery(runtime: ApiRuntime, c: Context) {
  const parsed = IdQuerySchema.safeParse(queryParams(c));
  if (!parsed.success)
    throw new PondError("invalid_request", "Pass a Save id as ?id=.");
  requireLibrary(runtime, parsed.data.libraryId);
  return parsed.data.id;
}

async function saveRow(runtime: ApiRuntime, id: string) {
  const [row] = await (await runtime.getDb())
    .select({
      files: saves.files,
      title: saves.title,
      description: saves.description,
      notes: saves.notes,
      caption: saves.caption,
      ocrText: saves.ocrText,
      transcript: saves.transcript,
    })
    .from(saves)
    .where(eq(saves.id, id))
    .limit(1);
  if (!row) throw new PondError("save_not_found", `No Save has the id ${id}.`);
  return row;
}

function noThumbnail(): never {
  throw new PondError("no_thumbnail", "This Save has no image to show.");
}

async function thumbnailFile(
  id: string,
  files: SaveFile[],
  size: ApiThumbnailSize,
) {
  const cover = pickCardFile(files);
  if (!cover) noThumbnail();
  /** File names come from our own DB, but basename() keeps a corrupted row from escaping the Save directory. */
  const path = saveFile(id, basename(cover.path));
  if (!existsSync(path)) noThumbnail();
  if (size === "original") {
    const type =
      cover.mimeType?.startsWith("image/") === true
        ? cover.mimeType
        : IMAGE_TYPES.get(extname(cover.path).toLowerCase());
    if (!type) noThumbnail();
    return { path, type };
  }
  const width = THUMBNAIL_WIDTHS[size];
  const thumb = await getOrCreateThumbnail({
    saveId: id,
    sourcePath: path,
    width,
    version: null,
  });
  if (!thumb) noThumbnail();
  return { path: thumb.path, type: "image/webp" };
}

async function editedCount<Value>(
  ids: readonly string[],
  read: (ids: readonly string[]) => Promise<Map<string, Value>>,
  edit: () => Promise<void>,
): Promise<{ changed: number }> {
  const before = await read(ids);
  await edit();
  const after = await read(ids);
  const changed = [...new Set(ids)].filter(
    (id) => JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)),
  ).length;
  return { changed };
}

async function tagsOf(runtime: ApiRuntime, ids: readonly string[]) {
  const rows = await (await runtime.getDb())
    .select({ id: saves.id, tags: saves.tags })
    .from(saves)
    .where(inArray(saves.id, [...ids]));
  return new Map(rows.map((row) => [row.id, [...row.tags].sort()]));
}

async function foldersOf(runtime: ApiRuntime, ids: readonly string[]) {
  const saved = await apiSavesByIds(runtime, ids, { includeDeleted: true });
  return new Map(saved.map((save) => [save.id, [...save.folderIds].sort()]));
}

export function savesRoutes(runtime: ApiRuntime = apiRuntime): Hono {
  const routes = new Hono();
  const bulkEdit = (input: BulkEdit) =>
    runtime.bulkEdit({
      ...input,
      actorReason: `api:${input.operation.kind}`,
    });

  routes.on(["GET", "POST"], "/get", async (c) => {
    const params = ApiSavesGetParamsSchema.parse(await readParams(c));
    requireLibrary(runtime, params.libraryId);
    const limit = Math.min(Number(params.limit ?? 200), 1000);
    const offset = Math.max(Number(params.offset ?? 0), 0);
    const includeDeleted =
      params.includeDeleted === "true" || params.includeDeleted === true;
    const ids = Array.isArray(params.ids)
      ? params.ids
      : (params.ids?.split(",").filter(Boolean) ?? []);
    const source = params.source
      ? SOURCES.find((entry) => entry === params.source)
      : undefined;
    const data = await selectApiSaves(runtime, {
      where: and(
        includeDeleted ? undefined : isNull(saves.deletedAt),
        ids.length ? inArray(saves.id, ids) : undefined,
        params.source
          ? source
            ? eq(saves.source, source)
            : sql`0`
          : undefined,
      ),
      limit,
      offset,
    });
    return c.json({
      status: "success",
      data,
      meta: {
        limit,
        offset,
        count: data.length,
        hasMore: data.length === limit,
      },
    });
  });

  routes.get("/info", async (c) => {
    const id = idQuery(runtime, c);
    const [save] = await apiSavesByIds(runtime, [id], {
      includeDeleted: true,
    });
    if (!save)
      throw new PondError("save_not_found", `No Save has the id ${id}.`);
    return c.json({ status: "success", data: save });
  });

  routes.get("/text", async (c) => {
    const id = idQuery(runtime, c);
    const row = await saveRow(runtime, id);
    const data: ApiSaveText = {
      id,
      title: row.title,
      description: row.description ?? "",
      note: row.notes ?? "",
      caption: row.caption ?? "",
      ocr: row.ocrText ?? "",
      transcript: row.transcript ?? "",
    };
    return c.json({ status: "success", data });
  });

  routes.get("/thumb", async (c) => {
    const id = idQuery(runtime, c);
    const requested = c.req.query("size") ?? "original";
    const size = API_THUMBNAIL_SIZES.find((entry) => entry === requested);
    if (!size)
      return apiError(
        c,
        "invalid_request",
        `Pass size as one of ${API_THUMBNAIL_SIZES.join(", ")}.`,
      );
    const { files } = await saveRow(runtime, id);
    const { path, type } = await thumbnailFile(id, files, size);
    const info = await stat(path);
    const etag = `"${info.size.toString(36)}-${info.mtimeMs.toString(36)}-${size}"`;
    const headers = {
      "content-type": type,
      "cache-control": "private, max-age=300",
      etag,
    };
    if (c.req.header("if-none-match") === etag)
      return c.body(null, 304, headers);
    const bytes = await readLibraryMedia(path);
    return c.body(Uint8Array.from(bytes), 200, headers);
  });

  routes.get("/file", async (c) => {
    const id = idQuery(runtime, c);
    const index = Number(c.req.query("index") ?? 0);
    const { files } = await saveRow(runtime, id);
    const file = Number.isInteger(index) ? files[index] : undefined;
    if (!file)
      throw new PondError(
        "invalid_request",
        `This Save has ${files.length} files. Pass an index below that.`,
      );
    const path = saveFile(id, basename(file.path));
    if (!existsSync(path))
      throw new PondError(
        "not_found",
        "This file is missing from the Library.",
      );
    const info = await stat(path);
    const type =
      file.mimeType ||
      mime.contentType(extname(path)) ||
      "application/octet-stream";
    return new Response(
      /** SAFETY: Node's web stream is the same ReadableStream the Response constructor reads. */
      Readable.toWeb(createReadStream(path)) as ReadableStream,
      {
        headers: {
          "content-type": type,
          "content-length": String(info.size),
          "content-disposition": `inline; filename="${encodeURIComponent(basename(path))}"`,
        },
      },
    );
  });

  routes.get("/related", async (c) => {
    const id = idQuery(runtime, c);
    await requireSaves(runtime, [id]);
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 12), 1), 50);
    const { relatedSaves } = await import("../core/semantic-recommendations");
    const { items } = await relatedSaves(await runtime.getDb(), { id, limit });
    return c.json({
      status: "success",
      data: await apiSavesByIds(
        runtime,
        items.map((item) => item.id),
      ),
    });
  });

  routes.get("/status", async (c) => {
    const ids = (c.req.query("ids") ?? "").split(",").filter(Boolean);
    if (!ids.length || ids.length > 1000)
      return apiError(
        c,
        "invalid_request",
        "Pass up to 1000 comma-separated Save ids as ?ids=.",
      );
    requireLibrary(runtime, c.req.query("libraryId"));
    const db = await runtime.getDb();
    const counts = await db
      .select({
        saveId: tasks.saveId,
        pending: sql<number>`sum(${tasks.status} in ('pending', 'deferred', 'running'))`,
        failed: sql<number>`sum(${tasks.status} in ('dead', 'blocked'))`,
      })
      .from(tasks)
      .where(inArray(tasks.saveId, ids))
      .groupBy(tasks.saveId);
    const byId = new Map(counts.map((row) => [row.saveId, row]));
    const data: ApiSaveState[] = (
      await apiSavesByIds(runtime, ids, { includeDeleted: true })
    ).map((save) => ({
      id: save.id,
      status: save.status,
      deleted: save.deletedAt !== null,
      pendingTasks: Number(byId.get(save.id)?.pending ?? 0),
      failedTasks: Number(byId.get(save.id)?.failed ?? 0),
      thumbnail: save.thumbnail,
      text: save.text,
    }));
    return c.json({ status: "success", data });
  });

  routes.post("/tags", async (c) => {
    const parsed = ApiEditTagsRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    const { ids, add, remove, libraryId } = parsed.data;
    requireLibrary(runtime, libraryId);
    await requireSaves(runtime, ids);
    const data = await editedCount(
      ids,
      (read) => tagsOf(runtime, read),
      async () => {
        if (add.length)
          await bulkEdit({
            ids,
            operation: { kind: "tags", tags: add, mode: "add" },
          });
        if (remove.length)
          await bulkEdit({
            ids,
            operation: { kind: "tags", tags: remove, mode: "remove" },
          });
      },
    );
    return c.json({ status: "success", data });
  });

  routes.post("/folders", async (c) => {
    const parsed = ApiEditFoldersRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    const { ids, add, remove, libraryId } = parsed.data;
    requireLibrary(runtime, libraryId);
    await requireSaves(runtime, ids);
    const named = [...new Set([...add, ...remove])];
    const known = new Set(
      named.length
        ? (
            await (
              await runtime.getDb()
            )
              .select({ id: folders.id })
              .from(folders)
              .where(inArray(folders.id, named))
          ).map((folder) => folder.id)
        : [],
    );
    const unknown = named.filter((id) => !known.has(id));
    if (unknown.length)
      throw new PondError(
        "folder_not_found",
        `No folder has the id ${unknown.join(", ")}.`,
      );
    const data = await editedCount(
      ids,
      (read) => foldersOf(runtime, read),
      () =>
        runtime.assignFolders({ saveIds: ids, addIds: add, removeIds: remove }),
    );
    return c.json({ status: "success", data });
  });

  for (const [path, kind] of [
    ["/trash", "trash"],
    ["/restore", "untrash"],
  ] as const) {
    routes.post(path, async (c) => {
      const parsed = ApiSaveIdsRequestSchema.safeParse(await c.req.json());
      if (!parsed.success) return invalidRequest(c, parsed.error);
      requireLibrary(runtime, parsed.data.libraryId);
      await requireSaves(runtime, parsed.data.ids);
      const data = await bulkEdit({
        ids: parsed.data.ids,
        operation: { kind },
      });
      return c.json({ status: "success", data });
    });
  }

  routes.post("/note", async (c) => {
    const parsed = ApiNoteRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    requireLibrary(runtime, parsed.data.libraryId);
    await requireSaves(runtime, [parsed.data.id]);
    const data = await bulkEdit({
      ids: [parsed.data.id],
      operation: { kind: "notes", notes: parsed.data.note },
    });
    return c.json({ status: "success", data });
  });

  routes.post("/rating", async (c) => {
    const parsed = ApiRatingRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    requireLibrary(runtime, parsed.data.libraryId);
    await requireSaves(runtime, parsed.data.ids);
    const data = await bulkEdit({
      ids: parsed.data.ids,
      operation: { kind: "rating", rating: parsed.data.rating },
    });
    return c.json({ status: "success", data });
  });

  routes.post("/favorite", async (c) => {
    const parsed = ApiFavoriteRequestSchema.safeParse(await c.req.json());
    if (!parsed.success) return invalidRequest(c, parsed.error);
    requireLibrary(runtime, parsed.data.libraryId);
    await requireSaves(runtime, parsed.data.ids);
    const data = await bulkEdit({
      ids: parsed.data.ids,
      operation: { kind: "favorite", favorite: parsed.data.favorite },
    });
    return c.json({ status: "success", data });
  });

  routes.onError(handleApiError);
  return routes;
}
