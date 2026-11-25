import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { saves } from "@pond/schema/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { resolvePaths } from "../../paths";
import { readSave } from "../pipeline/workers/apply";
import {
  fetchSourceIcon,
  hasReadableSourceIcon,
  hasSourceIcon,
} from "../pipeline/workers/source-icon";

const CONCURRENCY = 4;
/** Bump to re-check every stored icon once more on the next launch. */
const READABLE_CHECK_VERSION = 1;

function readableCheckMarker(): string {
  const { indexesDir, libraryId } = resolvePaths();
  return join(indexesDir, `${libraryId}.source-icon-check`);
}

async function readableCheckDone(): Promise<boolean> {
  try {
    const raw = await readFile(readableCheckMarker(), "utf8");
    return Number(raw.trim()) >= READABLE_CHECK_VERSION;
  } catch {
    return false;
  }
}

export async function backfillSourceIcons(): Promise<{
  ok: true;
  written: number;
}> {
  /** Reading every stored icon is a one-time repair, not a per-launch cost. */
  const checkReadable = !(await readableCheckDone());
  const db = await getDb();
  const rows = db
    .select({ id: saves.id, files: saves.files })
    .from(saves)
    .where(
      and(
        eq(saves.source, "web"),
        inArray(saves.status, ["complete", "failed"]),
        isNull(saves.deletedAt),
      ),
    )
    .all();

  if (rows.length === 0) return { ok: true, written: 0 };

  let candidates = 0;
  let written = 0;
  let cursor = 0;
  const runLane = async (): Promise<void> => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      if (!row) continue;
      try {
        const stored = hasSourceIcon(row.files);
        if (
          stored &&
          (!checkReadable || (await hasReadableSourceIcon(row.id, row.files)))
        ) {
          continue;
        }
        candidates += 1;
        const save = await readSave(row.id);
        if (!save) continue;
        if (await fetchSourceIcon(row.id, save, { replace: stored })) {
          written += 1;
        }
      } catch (error) {
        log.warn("[pond source-icon-backfill] failed", row.id, error);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, rows.length) }, runLane),
  );

  if (checkReadable) {
    await writeFile(
      readableCheckMarker(),
      String(READABLE_CHECK_VERSION),
      "utf8",
    ).catch((cause: unknown) =>
      log.warn("[pond source-icon-backfill] marker write failed", cause),
    );
  }

  log.info("[pond source-icon-backfill] done", {
    candidates,
    written,
    checkReadable,
  });
  return { ok: true, written };
}
