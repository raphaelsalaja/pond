import { createHash } from "node:crypto";
import {
  CANCEL_REASON,
  type ConnectedAccount,
  queueGenerations,
  saves,
  tasks,
} from "@pond/schema/db";
import { type ExtensionCookie, ROTATING_SESSIONS } from "@pond/schema/session";
import { and, eq, inArray, isNull, like, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "../db";
import { retryFailedSaves } from "./pipeline/enqueue-scheduling";
import { liftSourceAuthStop } from "./pipeline/source-admission";
import { currentLibraryId } from "./prefs-scope";
import { isAuthCookieName } from "./refresh/harvest-window";
import { listAccountsForSource } from "./sync/accounts";

const generationTasks = alias(tasks, "generation_tasks");
const resumedCredentials = new Map<
  string,
  { digest: string; saveIds: Set<string> }
>();
const seenCredentials = new Map<string, string>();

function credentialDigest(
  account: ConnectedAccount,
  cookies: readonly ExtensionCookie[],
): string {
  const rotating = ROTATING_SESSIONS.get(account.source);
  const values = cookies
    .filter(
      (cookie) =>
        isAuthCookieName(account.source, cookie.name, cookie.value) ||
        rotating?.rotates.includes(cookie.name),
    )
    .map((cookie) =>
      JSON.stringify([cookie.name, cookie.domain, cookie.path, cookie.value]),
    )
    .sort();
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

export async function resumeSessionDownloads(
  account: ConnectedAccount,
  cookies?: readonly ExtensionCookie[],
): Promise<number> {
  const credentialKey = `${currentLibraryId()}:${account.id}`;
  const digest = cookies ? credentialDigest(account, cookies) : null;
  /** Replaying the credentials that hit the sign-in wall would only hit it again. */
  if (digest === null || seenCredentials.get(credentialKey) !== digest) {
    if (digest !== null) seenCredentials.set(credentialKey, digest);
    await liftSourceAuthStop(account.source);
  }
  const accounts = await listAccountsForSource(account.source);
  const accountFilter =
    accounts[0]?.id === account.id
      ? or(eq(saves.accountId, account.id), isNull(saves.accountId))
      : eq(saves.accountId, account.id);
  const db = await getDb();
  const rows = db
    .selectDistinct({ id: saves.id })
    .from(saves)
    .innerJoin(tasks, eq(tasks.saveId, saves.id))
    .where(
      and(
        eq(saves.source, account.source),
        accountFilter,
        isNull(saves.deletedAt),
        inArray(saves.status, ["failed", "ingesting"]),
        eq(tasks.status, "blocked"),
        like(tasks.lastError, "AuthRequiredError:%"),
        notExists(
          db
            .select({ id: generationTasks.id })
            .from(generationTasks)
            .where(
              and(
                eq(generationTasks.saveId, saves.id),
                or(
                  eq(generationTasks.status, "cancelled"),
                  eq(generationTasks.lastError, CANCEL_REASON),
                ),
              ),
            ),
        ),
        notExists(
          db
            .select({ id: generationTasks.id })
            .from(generationTasks)
            .innerJoin(
              queueGenerations,
              eq(queueGenerations.id, generationTasks.generationId),
            )
            .where(
              and(
                eq(generationTasks.saveId, saves.id),
                inArray(generationTasks.status, [
                  "pending",
                  "deferred",
                  "running",
                  "blocked",
                ]),
                inArray(queueGenerations.status, [
                  "paused",
                  "cancelling",
                  "cancelled",
                ]),
              ),
            ),
        ),
      ),
    )
    .all();
  if (rows.length === 0) return 0;
  let credentials: { digest: string; saveIds: Set<string> } | undefined;
  if (digest !== null) {
    const previous = resumedCredentials.get(credentialKey);
    credentials =
      previous?.digest === digest ? previous : { digest, saveIds: new Set() };
  }
  const ids = rows
    .map((row) => row.id)
    .filter((id) => !credentials?.saveIds.has(id));
  if (ids.length === 0) return 0;
  if (credentials) {
    for (const id of ids) credentials.saveIds.add(id);
    resumedCredentials.set(credentialKey, credentials);
  }
  try {
    const queued = await retryFailedSaves(ids, { liftAuthStop: false });
    if (queued === 0) {
      for (const id of ids) credentials?.saveIds.delete(id);
    }
    return queued;
  } catch (error) {
    for (const id of ids) credentials?.saveIds.delete(id);
    throw error;
  }
}
