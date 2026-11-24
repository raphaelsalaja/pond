import { agentMessages, saves } from "@pond/schema/db";
import type { Save } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import { eq, inArray, isNotNull } from "drizzle-orm";
import { clipboard, shell } from "electron";
import { z } from "zod";
import { agentOperationRequest } from "../../../shared/agent-operations";
import type {
  AssistantChange,
  AssistantMetadata,
} from "../../../shared/assistant";
import {
  ASSISTANT_CHANGE_CAP,
  assistantMetadata,
} from "../../../shared/assistant";
import { getDb } from "../../db";
import { resolveSaveFilePath } from "../../ipc/helpers";
import { toCsv } from "../../lib/csv";
import { saveFile } from "../../paths";
import { executeBatch, executeTransaction } from "../executor";
import { writeExportFile } from "../export-files";
import { exportSavesToDirectory } from "../export-saves";
import {
  createFolder,
  deleteFolder,
  folderIdsForSave,
  listFolders,
  renameFolder,
  setSaveFolders,
} from "../folders";
import { extractFontFamily, renameWithFamily } from "../font-metadata";
import {
  duplicateMergeReceiptSchema,
  mergeDuplicateSaves,
  undoDuplicateMerge,
} from "../merge-duplicates";
import { enqueue } from "../pipeline/enqueue";
import { refreshSave } from "../refresh";
import { archiveSiteForSave } from "../refresh/archive-backfill";
import { createView, listViews, updateView } from "../saved-views";
import { syncAccount } from "../sync";
import { createTag, mergeTags, renameTag, setSaveTags } from "../tags";
import { fishMcp } from "./fish-mcp/live";
import { isMcpOperation } from "./fish-mcp/operations";
import { applyPondOperation, summarizeOperationResult } from "./operations";
import { filterGroup } from "./tools";

export const reviewInput = z.object({
  messageId: z.string().min(1),
  changeIds: z.array(z.string()).min(1).max(ASSISTANT_CHANGE_CAP),
  action: z.enum(["apply", "undo", "dismiss"]),
});

function sameValue(
  a: string | number | null | Array<string>,
  b: string | number | null | Array<string>,
): boolean {
  return Array.isArray(a) && Array.isArray(b)
    ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
    : a === b;
}

type ReviewSave = Pick<
  Save,
  "id" | "title" | "notes" | "tags" | "rating" | "deletedAt"
>;
export const reviewDependencies = {
  async message(id: string) {
    const db = await getDb();
    return db
      .select({ role: agentMessages.role, metadata: agentMessages.metadata })
      .from(agentMessages)
      .where(eq(agentMessages.id, id))
      .get();
  },
  async save(id: string): Promise<ReviewSave | undefined> {
    const db = await getDb();
    return db.select().from(saves).where(eq(saves.id, id)).get();
  },
  async saveMetadata(id: string, metadata: AssistantMetadata) {
    const db = await getDb();
    await db
      .update(agentMessages)
      .set({ metadata })
      .where(eq(agentMessages.id, id));
  },
  executeTransaction,
  executeBatch,
  folderIdsForSave,
  listFolders,
  setSaveFolders,
  setSaveTags,
  createFolder,
  deleteFolder,
  renameFolder,
  createTag,
  mergeTags,
  renameTag,
  mergeDuplicateSaves,
  undoDuplicateMerge,
  applyPondOperation,
  prepareTools: () => fishMcp.ensure(),
};
type ReviewDependencies = typeof reviewDependencies;

const reviewing = new Set<string>();

export async function reviewChanges(
  input: z.infer<typeof reviewInput>,
  deps: ReviewDependencies = reviewDependencies,
) {
  if (reviewing.has(input.messageId)) {
    throw new Error("These changes are already being processed.");
  }
  reviewing.add(input.messageId);
  try {
    const message = await deps.message(input.messageId);
    if (message?.role !== "assistant") {
      throw new Error("This review no longer exists.");
    }
    const metadata = assistantMetadata.parse(message.metadata ?? {});
    const changes = metadata.changes ?? [];
    const selected = new Set(input.changeIds);
    for (const change of changes) {
      if (!selected.has(change.id)) {
        continue;
      }
      const eligible =
        input.action === "undo"
          ? change.status === "applied"
          : change.status === "pending";
      if (!eligible) {
        continue;
      }
      try {
        if (input.action === "dismiss") {
          change.status = "dismissed";
        } else if (change.field === "action") {
          await writeAction(change, input.action, deps);
          change.status = input.action === "undo" ? "undone" : "applied";
        } else {
          const current = await deps.save(change.saveId);
          if (!current) {
            throw new Error("This Save is unavailable.");
          }
          const value =
            change.field === "folders"
              ? await deps.folderIdsForSave(change.saveId)
              : change.field === "note"
                ? (current.notes ?? "")
                : change.field === "rating"
                  ? (current.rating ?? null)
                  : change.field === "trash"
                    ? current.deletedAt
                      ? "trashed"
                      : "active"
                    : current[change.field];
          const expected =
            input.action === "undo" ? change.after : change.before;
          if (change.field !== "rating" && !sameValue(value, expected)) {
            throw new Error(
              "This value changed since the review. Your newer edit was kept.",
            );
          }
          if (change.field === "rating" && value !== expected) {
            throw new Error(
              "This value changed since the review. Your newer edit was kept.",
            );
          }
          await writeChange(change, input.action, deps);
          change.status = input.action === "undo" ? "undone" : "applied";
        }
        delete change.error;
      } catch (error) {
        change.error =
          error instanceof Error
            ? error.message
            : "Could not update this Save. Try again.";
      }
      await deps.saveMetadata(input.messageId, { ...metadata, changes });
    }
    return { changes };
  } finally {
    reviewing.delete(input.messageId);
  }
}

async function writeChange(
  change: AssistantChange,
  action: "apply" | "undo",
  deps: ReviewDependencies,
) {
  if (change.field === "folders") {
    const ids = action === "undo" ? change.before : change.after;
    const valid = new Set(
      (await deps.listFolders()).map((folder) => folder.id),
    );
    if (ids.some((id) => !valid.has(id))) {
      throw new Error(
        "A folder no longer exists. Your current folders were kept.",
      );
    }
    await deps.setSaveFolders(change.saveId, ids);
  } else if (change.field === "tags") {
    const result = await deps.setSaveTags(
      change.saveId,
      action === "undo" ? change.before : change.after,
    );
    if (!result.ok) {
      throw new Error("Could not update tags for this Save.");
    }
  } else if (change.field === "title" || change.field === "note") {
    const key = change.field === "note" ? "notes" : "title";
    const next = action === "undo" ? change.before : change.after;
    const prev = action === "undo" ? change.after : change.before;
    await deps.executeTransaction({
      kind: "update",
      model: "save",
      id: change.saveId,
      patch: { [key]: next },
      before: { [key]: prev },
      meta: { actor: "agent", actorReason: `assistant:${action}` },
    });
  } else if (change.field === "rating") {
    const next = action === "undo" ? change.before : change.after;
    const prev = action === "undo" ? change.after : change.before;
    await deps.executeTransaction({
      kind: "update",
      model: "save",
      id: change.saveId,
      patch: { rating: next },
      before: { rating: prev },
      meta: { actor: "agent", actorReason: `assistant:${action}` },
    });
  } else if (change.field === "trash") {
    const next = action === "undo" ? change.before : change.after;
    await deps.executeTransaction({
      kind: next === "trashed" ? "trash" : "untrash",
      model: "save",
      id: change.saveId,
      meta: { actor: "agent", actorReason: `assistant:${action}` },
    });
  }
}

const ActionPayloadSchema = z.object({
  id: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  from: z.json().optional(),
  name: z.json().optional(),
  parentId: z.string().optional().catch(undefined),
  query: filterGroup.optional(),
  sortKey: z.string().optional().catch(undefined),
  sortDir: z.string().optional().catch(undefined),
  layout: z.string().optional().catch(undefined),
  ids: z.array(z.string()).optional(),
  keepId: z.json().optional(),
  mergeReceipt: duplicateMergeReceiptSchema.optional(),
  directory: z.json().optional(),
  accountId: z.json().optional(),
  url: z.json().optional(),
  pattern: z.json().optional(),
});

async function writeAction(
  change: Extract<AssistantChange, { field: "action" }>,
  action: "apply" | "undo",
  deps: ReviewDependencies,
) {
  if (change.action === "runOperation") {
    if (action === "undo") {
      throw new Error("Use Pond's Undo for this operation.");
    }
    const request = agentOperationRequest.parse(change.payload);
    /** An idle server closes after 10 minutes, so a late Apply reconnects before it looks the tool up. */
    if (isMcpOperation(request.operation)) {
      await deps.prepareTools();
    }
    const result = await deps.applyPondOperation(request);
    change.payload = { ...request, result: summarizeOperationResult(result) };
    return;
  }
  const payload = ActionPayloadSchema.parse(change.payload ?? {});
  if (action === "undo") {
    if (change.action === "folderCreate" && payload.id !== undefined) {
      await deps.deleteFolder(payload.id);
    } else if (
      change.action === "folderRename" &&
      payload.id !== undefined &&
      change.before
    ) {
      await deps.renameFolder(payload.id, change.before);
    } else if (
      change.action === "tagRename" &&
      change.before &&
      payload.to !== undefined
    ) {
      await deps.renameTag(payload.to, change.before);
    } else if (change.action === "quickAdd" && payload.id !== undefined) {
      await deps.executeTransaction({
        kind: "trash",
        model: "save",
        id: payload.id,
        meta: { actor: "agent", actorReason: "assistant:undo" },
      });
    } else if (
      change.action === "mergeDuplicates" &&
      payload.ids !== undefined
    ) {
      if (payload.mergeReceipt) {
        await deps.undoDuplicateMerge(payload.mergeReceipt);
      } else {
        await deps.executeBatch(
          payload.ids
            .filter((id) => id !== payload.keepId)
            .map((id) => ({
              kind: "untrash" as const,
              model: "save" as const,
              id,
              meta: { actor: "agent" as const, actorReason: "assistant:undo" },
            })),
        );
      }
    } else {
      throw new Error("This action cannot be undone from here.");
    }
    return;
  }
  if (change.action === "folderCreate") {
    const folder = await deps.createFolder({
      name: String(payload.name ?? change.after),
      parentId: payload.parentId ?? null,
    });
    payload.id = folder.id;
  } else if (change.action === "folderRename") {
    await deps.renameFolder(String(payload.id ?? ""), change.after);
  } else if (change.action === "folderDelete") {
    await deps.deleteFolder(String(payload.id ?? ""));
  } else if (change.action === "tagCreate") {
    await deps.createTag({ name: change.after });
  } else if (change.action === "tagRename") {
    await deps.renameTag(String(payload.from ?? ""), change.after);
  } else if (change.action === "tagMerge") {
    await deps.mergeTags(String(payload.from ?? ""), change.after);
  } else if (change.action === "savedViewCreate") {
    const created = await createView({
      name: change.after,
      query: payload.query,
      sortKey: payload.sortKey,
      sortDir: payload.sortDir,
      layout: payload.layout,
    });
    if (!created.ok || !created.id) {
      throw new Error("Could not create this saved view.");
    }
    payload.id = created.id;
  } else if (change.action === "savedViewRename") {
    await updateView(String(payload.id ?? ""), { name: change.after });
  } else if (change.action === "savedViewUpdate") {
    const views = await listViews();
    const view = views.find((row) => row.id === payload.id);
    if (!view) {
      throw new Error("This saved view no longer exists.");
    }
    await updateView(view.id, {
      query: payload.query ?? view.query,
    });
  } else if (change.action === "quickAdd") {
    const url = String(payload.url ?? change.after);
    const result = await enqueue(url, { trigger: "user:quickAdd" });
    if ("id" in result) {
      payload.id = result.id;
    }
  } else if (change.action === "mergeDuplicates") {
    const result = await deps.mergeDuplicateSaves({
      keepId: String(payload.keepId ?? ""),
      ids: payload.ids ?? [],
      meta: { actor: "agent", actorReason: "assistant:merge" },
    });
    if (!result.ok || !result.receipt) {
      throw new Error("Could not merge these Saves.");
    }
    payload.mergeReceipt = result.receipt;
  } else if (change.action === "exportFiles" || change.action === "exportCsv") {
    const directory = String(payload.directory ?? "");
    const ids = payload.ids ?? [];
    if (!directory) {
      throw new Error("Choose an export folder first.");
    }
    await exportToDirectory(ids, directory, change.action === "exportCsv");
  } else if (change.action === "syncNow") {
    await syncAccount(String(payload.accountId ?? ""), { trigger: "manual" });
  } else if (change.action === "refresh") {
    await refreshSave(change.saveId);
  } else if (change.action === "archive") {
    await archiveSiteForSave(change.saveId);
  } else if (change.action === "copyUrl") {
    const db = await getDb();
    const row = db
      .select({ url: saves.url })
      .from(saves)
      .where(eq(saves.id, change.saveId))
      .get();
    if (!row?.url) {
      throw new Error("This Save has no URL.");
    }
    await clipboard.writeText(row.url);
  } else if (change.action === "reveal") {
    const target = await resolveSaveFilePath(change.saveId, 0);
    if (!target.ok) {
      throw new Error("Could not reveal this Save.");
    }
    shell.showItemInFolder(target.path);
  } else if (change.action === "batchRename") {
    const pattern = String(payload.pattern ?? "");
    const ids = payload.ids ?? [];
    const db = await getDb();
    const rows = await db.select().from(saves).where(inArray(saves.id, ids));
    let n = 0;
    const txs: Array<Transaction> = [];
    for (const row of rows) {
      n += 1;
      const stored = row.files[0];
      const family =
        stored?.family ??
        (stored?.path
          ? await extractFontFamily(saveFile(row.id, stored.path))
          : null);
      const title = renameWithFamily(pattern, {
        n,
        title: row.title ?? "Untitled",
        id: row.id,
        family,
      });
      if (title === row.title) {
        continue;
      }
      txs.push({
        kind: "update" as const,
        model: "save" as const,
        id: row.id,
        patch: { title },
        before: { title: row.title },
        meta: { actor: "agent" as const, actorReason: "assistant:rename" },
      });
    }
    await deps.executeBatch(txs);
  } else if (change.action === "purgeTrash") {
    const db = await getDb();
    const rows = await db
      .select()
      .from(saves)
      .where(isNotNull(saves.deletedAt));
    await deps.executeBatch(
      rows.map((row) => ({
        kind: "purge" as const,
        model: "save" as const,
        id: row.id,
        before: row,
        meta: { actor: "agent" as const, actorReason: "assistant:purge" },
      })),
    );
  }
  /** A JSON round trip, unlike structuredClone, drops the undefined and non-JSON values `z.json()` rejects. */
  const serialized = JSON.stringify(payload);
  change.payload = z.record(z.string(), z.json()).parse(JSON.parse(serialized));
}

async function exportToDirectory(
  ids: Array<string>,
  directory: string,
  csv: boolean,
) {
  if (!csv) {
    await exportSavesToDirectory(ids, directory);
    return;
  }
  const db = await getDb();
  const rows = await db.select().from(saves).where(inArray(saves.id, ids));
  if (csv) {
    const columns = [
      "id",
      "source",
      "title",
      "url",
      "author",
      "notes",
    ] as const;
    await writeExportFile(
      directory,
      "pond-export.csv",
      toCsv(
        rows.map((row) => columns.map((column) => String(row[column] ?? ""))),
        [...columns],
      ),
    );
    return;
  }
}
