import { saves } from "@pond/schema/db";
import type { ConnectedAccount, Source } from "@pond/schema/db";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { extractorFor } from "../pipeline/extractors";
import { probeUserHandle } from "../refresh/harvest-window";
import {
  listAccountsForSource,
  normalizeHandle,
  partitionForAccount,
  patchAccount,
} from "./accounts";

async function inferAccountKey(source: Source): Promise<string | null> {
  const db = await getDb();
  const rows = await db
    .select({ url: saves.url, author: saves.author })
    .from(saves)
    .where(eq(saves.source, source))
    .limit(50);
  const hasPathParser = extractorFor(source)?.handleFromPath !== undefined;
  let result: string | null = null;
  for (const row of rows) {
    const handle =
      handleFromUrl(source, row.url) ??
      (hasPathParser ? null : (row.author ?? null));
    if (handle) {
      result = handle.replace(/^@/, "");
      break;
    }
  }
  return result;
}

function isCachedHandleValid(source: Source, handle: string): boolean {
  const extractor = extractorFor(source);
  if (extractor?.handleFromPath === undefined) {
    return true;
  }
  const parsed = extractor.handleFromPath([handle]);
  return parsed !== null && parsed !== undefined;
}

export async function resolveAccountHandle(
  account: ConnectedAccount,
): Promise<string | null> {
  const { source } = account;
  const cached = normalizeHandle(account.handle);
  if (cached && isCachedHandleValid(source, cached)) {
    return cached;
  }
  if (cached) {
    log.info(
      `[pond sync:${source}] ignoring invalid cached handle "${cached}"; re-resolving`,
    );
  }

  const siblings = await listAccountsForSource(source);
  if (siblings.length === 1) {
    const inferred = await inferAccountKey(source);
    if (inferred) {
      await persistAccountHandle(account, inferred);
      return inferred;
    }
  }

  log.info(`[pond sync:${source}] probing hidden window for handle`);
  const probed = await probeUserHandle(source, partitionForAccount(account.id));
  if (probed) {
    log.info(`[pond sync:${source}] probed handle`, probed);
    await persistAccountHandle(account, probed);
    return probed;
  }
  return null;
}

export async function ensureAccountHandle(
  account: ConnectedAccount,
): Promise<void> {
  if (normalizeHandle(account.handle)) {
    return;
  }
  if (!extractorFor(account.source)?.probeExpression) {
    return;
  }
  try {
    const probed = await probeUserHandle(
      account.source,
      partitionForAccount(account.id),
    );
    if (!probed) {
      return;
    }
    log.info(`[pond sync:${account.source}] probed handle`, probed);
    await persistAccountHandle(account, probed);
  } catch (error) {
    log.warn(`[pond sync:${account.source}] handle probe failed`, error);
  }
}

async function persistAccountHandle(
  account: ConnectedAccount,
  handle: string,
): Promise<void> {
  try {
    await patchAccount(account.id, {
      handle,
      avatarUrl: null,
      avatarCheckedAt: null,
    });
  } catch (error) {
    log.warn(`[pond sync:${account.source}] failed to cache handle`, error);
  }
}

function handleFromUrl(source: Source, url: string): string | null {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    return extractorFor(source)?.handleFromPath?.(segments) ?? null;
  } catch {
    return null;
  }
}
