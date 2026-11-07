import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { type NewSave, type Save, saves } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import mime from "mime-types";
import { getDb } from "../../db";
import { executeTransaction, withMutationScope } from "../executor";
import { createManualSave } from "../manual-import";
import { persistSave } from "../persist-save";
import { type EnqueueOneResult, enqueue } from "../pipeline/enqueue";
import { setSaveTags } from "../tags";
import { hasUserTitle } from "../user-metadata";
import type { createMymindClient, MymindObject } from "./client";
import { mymindContentText } from "./content";
import type { MymindSyncState } from "./state";

interface MymindMetadata {
  title?: string;
  notes?: string;
  tags: string[];
  createdAt: Date;
  savedAt: Date;
}

interface MymindImportDependencies {
  enqueueLink: (url: string, accountId: string) => Promise<EnqueueOneResult>;
  isOwnedSave: (id: string, accountId: string) => Promise<boolean>;
  createSave: typeof createManualSave;
  applyMetadata: (
    id: string,
    metadata: MymindMetadata,
    beforeWrite: () => void,
  ) => Promise<void>;
}

export function mergeMymindMetadata(
  current: Pick<Save, "notes" | "tags">,
  incoming: MymindMetadata,
): MymindMetadata {
  const notes = current.notes || undefined;
  return {
    ...incoming,
    notes:
      !incoming.notes || notes?.includes(incoming.notes)
        ? notes
        : [notes, incoming.notes].filter(Boolean).join("\n\n"),
    tags: [...new Set([...current.tags, ...incoming.tags])],
  };
}

const defaultDependencies: MymindImportDependencies = {
  enqueueLink: (url, accountId) =>
    enqueue(url, { trigger: "sync:mymind", accountId, adoptOrphaned: false }),
  async isOwnedSave(id, accountId) {
    const db = await getDb();
    const saved = db
      .select({ accountId: saves.accountId })
      .from(saves)
      .where(eq(saves.id, id))
      .get();
    return saved?.accountId === accountId;
  },
  createSave: createManualSave,
  applyMetadata: (id, incoming, beforeWrite) =>
    withMutationScope(async () => {
      const db = await getDb();
      const current = db.select().from(saves).where(eq(saves.id, id)).get();
      if (!current) throw new Error("The imported mymind Save is missing.");
      const metadata = mergeMymindMetadata(current, incoming);
      const patch: Partial<NewSave> = {
        importedFrom: "mymind",
        notes: metadata.notes ?? null,
        createdAt: metadata.createdAt,
        savedAt: metadata.savedAt,
      };
      beforeWrite();
      const saved = await persistSave(id, patch, {
        actorReason: "mymind:sync",
      });
      if (!saved) throw new Error("The imported mymind Save is missing.");
      beforeWrite();
      const tags = await setSaveTags(id, metadata.tags);
      if (!tags.ok) throw new Error("The mymind tags could not be saved.");
      if (metadata.title && !hasUserTitle(id)) {
        beforeWrite();
        await executeTransaction({
          kind: "update",
          model: "save",
          id,
          before: { title: saved.title },
          patch: { title: metadata.title },
          titleLock: { before: false, after: true },
          meta: { actor: "user", actorReason: "mymind:sync" },
        });
      }
    }),
};

function sourceUrl(object: MymindObject): string | undefined {
  const value = object.source?.url || object.url;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    // Invalid source URLs cannot be imported as links.
  }
  throw new Error("mymind returned an invalid source URL.");
}

async function downloadBlob(
  response: Response,
  directory: string,
  object: MymindObject,
  signal?: AbortSignal,
): Promise<string> {
  if (!response.ok || !response.body)
    throw new Error("The mymind file could not be downloaded.");
  const extension = mime.extension(response.headers.get("content-type") ?? "");
  const originalName = basename(
    (object.blob?.name || "mymind-file").replaceAll("\\", "/"),
  );
  const name =
    originalName === "." || originalName === ".." || !originalName
      ? "mymind-file"
      : originalName;
  const filename = extname(name) || !extension ? name : `${name}.${extension}`;
  const path = join(directory, filename);
  const file = await open(path, "wx");
  const reader = response.body.getReader();
  const cancel = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      signal?.throwIfAborted();
      if (chunk.done) break;
      await file.writeFile(chunk.value);
    }
    return path;
  } finally {
    signal?.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await file.close();
  }
}

export async function importMymindObject(
  {
    object,
    accountId,
    state,
    client,
    persist,
    beforeWrite,
    signal,
  }: {
    object: MymindObject;
    accountId: string;
    state: MymindSyncState;
    client: Pick<ReturnType<typeof createMymindClient>, "getBlob">;
    persist: () => Promise<void>;
    beforeWrite: () => void;
    signal?: AbortSignal;
  },
  dependencies: MymindImportDependencies = defaultDependencies,
): Promise<{ id: string; imported: boolean }> {
  signal?.throwIfAborted();
  const previous = Object.hasOwn(state.imports, object.id)
    ? state.imports[object.id]
    : undefined;
  if (previous?.complete) return { id: previous.saveId, imported: false };

  const notes = [
    mymindContentText(object.content),
    ...(object.notes ?? []).map((note) => mymindContentText(note.content)),
  ]
    .filter((text) => text.trim())
    .join("\n\n");
  const metadata: MymindMetadata = {
    title: object.title?.trim() || undefined,
    notes: notes || undefined,
    tags: [...new Set([...object.tags.map((tag) => tag.name), "mymind"])],
    createdAt: new Date(object.created),
    savedAt: new Date(object.created),
  };
  const url = sourceUrl(object);
  if (!url && !object.blob && !metadata.title && !metadata.notes)
    throw new Error("The mymind card is empty. Pond will try again later.");

  async function record(saveId: string, complete: boolean): Promise<void> {
    beforeWrite();
    const old = state.imports;
    state.imports = { ...old, [object.id]: { saveId, complete } };
    try {
      await persist();
    } catch (error) {
      state.imports = old;
      throw error;
    }
  }

  if (previous) {
    beforeWrite();
    await dependencies.applyMetadata(previous.saveId, metadata, beforeWrite);
    await record(previous.saveId, true);
    return { id: previous.saveId, imported: true };
  }

  if (url && !object.blob) {
    beforeWrite();
    const result = await dependencies.enqueueLink(url, accountId);
    const owned =
      result.created || (await dependencies.isOwnedSave(result.id, accountId));
    await record(result.id, !owned);
    if (owned) {
      signal?.throwIfAborted();
      beforeWrite();
      await dependencies.applyMetadata(result.id, metadata, beforeWrite);
      await record(result.id, true);
    }
    return { id: result.id, imported: owned };
  }

  const directory = object.blob
    ? await mkdtemp(join(tmpdir(), "pond-mymind-"))
    : undefined;
  try {
    const file = directory
      ? await downloadBlob(
          await client.getBlob(object.id, signal),
          directory,
          object,
          signal,
        )
      : undefined;
    signal?.throwIfAborted();
    beforeWrite();
    const result = await dependencies.createSave({
      accountId,
      source: "local",
      sourceId: `mymind:${object.id}`,
      importedFrom: "mymind",
      title: metadata.title,
      note: metadata.notes,
      tags: metadata.tags,
      createdAt: metadata.createdAt,
      savedAt: metadata.savedAt,
      url,
      ...(file ? { filePaths: [file] } : { mediaType: "text" }),
    });
    if (!result.ok) throw new Error("The mymind card could not be imported.");
    const owned =
      !result.skipped || (await dependencies.isOwnedSave(result.id, accountId));
    await record(result.id, true);
    return { id: result.id, imported: owned };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
