import {
  type NewSavedView,
  type SavedView,
  savedViews as savedViewsTable,
} from "@pond/schema/db";
import { EMPTY_QUERY, type Query } from "@pond/schema/filters/types";
import type { Transaction } from "@pond/schema/tx";
import type {
  BatchRenameInput,
  OkFailure,
  OkResult,
} from "@shared/query-contracts-shared";
import { applyRenameTemplate } from "@shared/rename-template";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";
import type { Db } from "../db";
import { getDb } from "../db";
import { executeBatch } from "./executor";
import { recordBatchForUndo } from "./undo";

interface SavedViewRuntime {
  getDb: () => Promise<Db>;
  commit: (transactions: Transaction[]) => Promise<void>;
  recordUndo?: (transactions: Transaction[]) => void;
}

const defaultRuntime: SavedViewRuntime = {
  getDb,
  async commit(transactions) {
    await executeBatch(transactions);
  },
  recordUndo: recordBatchForUndo,
};

const StoredQuerySchema = z.custom<Query>(
  (value) => value instanceof Object && !Array.isArray(value),
);

function coerceQuery(raw: Query | null): Query {
  return StoredQuerySchema.safeParse(raw).data ?? EMPTY_QUERY;
}

export async function listViews(
  runtime: SavedViewRuntime = defaultRuntime,
): Promise<SavedView[]> {
  const db = await runtime.getDb();
  const rows = await db
    .select()
    .from(savedViewsTable)
    .orderBy(asc(savedViewsTable.sortOrder), asc(savedViewsTable.createdAt));
  return rows.map((row) => ({ ...row, query: coerceQuery(row.query) }));
}

interface CreateViewInput {
  name: string;
  kind?: SavedView["kind"];
  parentId?: string | null;
  question?: string | null;
  query?: Query;
  sortKey?: string;
  sortDir?: string;
  layout?: string | null;
}

const MISSING_NAME: OkFailure = { ok: false, error: "Enter a name." };
const NOT_FOUND: OkFailure = { ok: false, error: "Saved view not found." };
const INVALID_PARENT: OkFailure = {
  ok: false,
  error: "Choose a different parent group.",
};

export async function createView(
  input: CreateViewInput,
  runtime: SavedViewRuntime = defaultRuntime,
): Promise<OkResult<{ id: string }>> {
  const name = input.name.trim();
  if (!name) return MISSING_NAME;
  return mutateViews(runtime, async (db) => {
    if (!(await validParent(db, input.parentId ?? null))) return INVALID_PARENT;
    const data: NewSavedView = {
      id: ulid(),
      name,
      kind: input.kind ?? "saved_view",
      parentId: input.parentId ?? null,
      question: input.question ?? null,
      query: input.query ?? EMPTY_QUERY,
      sortKey: input.sortKey ?? "savedAt",
      sortDir: input.sortDir ?? "desc",
      layout: input.layout ?? null,
      sortOrder: await nextSortOrder(db),
    };
    await runtime.commit([
      {
        kind: "create",
        model: "saved_view",
        id: data.id,
        data,
        meta: { actor: "user", actorReason: "saved-view-create" },
      },
    ]);
    return { ok: true, id: data.id };
  });
}

export async function updateView(
  id: string,
  patch: Partial<Omit<CreateViewInput, "kind">> & { sortOrder?: number },
  runtime: SavedViewRuntime = defaultRuntime,
): Promise<OkResult> {
  return mutateViews(runtime, async (db) => {
    const row = await viewById(db, id);
    if (!row) return NOT_FOUND;
    if (
      patch.parentId !== undefined &&
      !(await validParent(db, patch.parentId, id))
    ) {
      return INVALID_PARENT;
    }
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) return MISSING_NAME;
      patch = { ...patch, name };
    }
    await runtime.commit([
      {
        kind: "update",
        model: "saved_view",
        id,
        patch,
        before: row,
        meta: { actor: "user", actorReason: "saved-view-update" },
      },
    ]);
    return { ok: true };
  });
}

export async function renameView(
  id: string,
  name: string,
  runtime: SavedViewRuntime = defaultRuntime,
): Promise<OkResult> {
  const target = name.trim();
  if (!target) return MISSING_NAME;
  return updateView(id, { name: target }, runtime);
}

export async function renameViewsBatch(
  input: BatchRenameInput,
  runtime: SavedViewRuntime = defaultRuntime,
): Promise<OkResult<{ renamed: number }>> {
  const ids = [...new Set(input.ids.filter(Boolean))];
  const pattern = input.pattern.trim();
  if (!pattern || ids.length === 0)
    return { ok: false, error: "Enter a name pattern and choose views." };
  return mutateViews(runtime, async (db) => {
    const rows = await db
      .select()
      .from(savedViewsTable)
      .where(inArray(savedViewsTable.id, ids));
    const byId = new Map(rows.map((row) => [row.id, row]));
    const transactions: Transaction[] = [];
    for (const [index, id] of ids.entries()) {
      const row = byId.get(id);
      if (!row) continue;
      const name = applyRenameTemplate(pattern, {
        index,
        title: row.name,
        original: row.name,
        id: row.id,
        date: row.createdAt,
        start: input.start,
        replacement: input.replacement,
        textCase: input.textCase,
      });
      if (!name || name === row.name) continue;
      transactions.push({
        kind: "update",
        model: "saved_view",
        id,
        patch: { name },
        before: { name: row.name },
        meta: { actor: "user", actorReason: "saved-view-batch-rename" },
      });
    }
    await runtime.commit(transactions);
    runtime.recordUndo?.(transactions);
    return { ok: true, renamed: transactions.length };
  });
}

export async function deleteView(
  id: string,
  runtime: SavedViewRuntime = defaultRuntime,
): Promise<OkResult> {
  return mutateViews(runtime, async (db) => {
    const row = await viewById(db, id);
    if (!row) return NOT_FOUND;
    const children = await db
      .select()
      .from(savedViewsTable)
      .where(eq(savedViewsTable.parentId, id));
    const transactions: Transaction[] = children.map((child) => ({
      kind: "update",
      model: "saved_view",
      id: child.id,
      patch: { parentId: row.parentId },
      before: child,
      meta: { actor: "user", actorReason: "saved-view-promote" },
    }));
    transactions.push({
      kind: "delete",
      model: "saved_view",
      id,
      before: row,
      meta: { actor: "user", actorReason: "saved-view-delete" },
    });
    await runtime.commit(transactions);
    return { ok: true };
  });
}

export async function reorderViews(
  orderedIds: string[],
  runtime: SavedViewRuntime = defaultRuntime,
): Promise<OkResult> {
  return mutateViews(runtime, async (db) => {
    const txs: Transaction[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (!id) continue;
      const row = await viewById(db, id);
      if (!row || row.sortOrder === i) continue;
      txs.push({
        kind: "update",
        model: "saved_view",
        id,
        patch: { sortOrder: i },
        before: { sortOrder: row.sortOrder },
        meta: { actor: "user", actorReason: "saved-view-reorder" },
      });
    }
    if (txs.length === 0) return { ok: true };
    await runtime.commit(txs);
    runtime.recordUndo?.(txs);
    return { ok: true };
  });
}

async function viewById(db: Db, id: string): Promise<SavedView | undefined> {
  const rows = await db
    .select()
    .from(savedViewsTable)
    .where(eq(savedViewsTable.id, id));
  return rows[0];
}

async function nextSortOrder(db: Db): Promise<number> {
  const rows = await db
    .select({
      max: sql<number>`coalesce(max(${savedViewsTable.sortOrder}), -1)`,
    })
    .from(savedViewsTable);
  return (rows[0]?.max ?? -1) + 1;
}

async function validParent(
  db: Db,
  parentId: string | null,
  movingId?: string,
): Promise<boolean> {
  const visited = new Set<string>();
  let ancestorId = parentId;
  while (ancestorId !== null) {
    if (ancestorId === movingId || visited.has(ancestorId)) return false;
    visited.add(ancestorId);
    const parent = await viewById(db, ancestorId);
    if (parent?.kind !== "group") return false;
    ancestorId = parent.parentId;
  }
  return true;
}

const mutationQueues = new WeakMap<Db, Promise<void>>();

async function mutateViews<Result>(
  runtime: SavedViewRuntime,
  operation: (db: Db) => Promise<Result>,
): Promise<Result> {
  const db = await runtime.getDb();
  const previous = mutationQueues.get(db) ?? Promise.resolve();
  const result = previous.then(() => operation(db));
  mutationQueues.set(
    db,
    result.then(
      () => {},
      () => {},
    ),
  );
  return result;
}
