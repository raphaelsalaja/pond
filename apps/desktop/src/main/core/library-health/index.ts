import { join } from "node:path";
import { saves, tasks } from "@pond/schema/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { directoryExists } from "../../lib/library-sidecars";
import { appDataRoot, saveDir } from "../../paths";
import { libraryIntegrityRuntime } from "../library-integrity";
import { currentLibraryId } from "../prefs-scope";
import { createLibraryHealthService } from "./service";
import { createLibraryHealthStore } from "./store";

export { debugReportHealth } from "./report";

const HEALTH_FIELDS = {
  id: saves.id,
  title: saves.title,
  source: saves.source,
  sourceId: saves.sourceId,
  url: saves.url,
  files: saves.files,
  status: saves.status,
  blurhash: saves.blurhash,
  coverIndex: saves.coverIndex,
};

const VIDEO_FAILURE_FIELDS = {
  id: saves.id,
  title: saves.title,
  status: saves.status,
  files: saves.files,
  mediaType: saves.mediaType,
  rawJson: saves.rawJson,
  error: tasks.lastError,
  attempts: tasks.attempts,
  maxAttempts: tasks.maxAttempts,
};

const store = createLibraryHealthStore(() =>
  join(appDataRoot(), "library-health"),
);

export const libraryHealthService = createLibraryHealthService({
  now: Date.now,
  libraryId: currentLibraryId,
  integrityRuntime: libraryIntegrityRuntime,
  async listSaves() {
    const db = await getDb();
    return db
      .select(HEALTH_FIELDS)
      .from(saves)
      .where(isNull(saves.deletedAt))
      .all();
  },
  async getSave(id) {
    const db = await getDb();
    return (
      db
        .select(HEALTH_FIELDS)
        .from(saves)
        .where(and(eq(saves.id, id), isNull(saves.deletedAt)))
        .get() ?? null
    );
  },
  async listVideoDownloadFailures() {
    const db = await getDb();
    /** The join reads Captures only for Saves whose video task already failed terminally. */
    return db
      .select(VIDEO_FAILURE_FIELDS)
      .from(tasks)
      .innerJoin(saves, eq(tasks.saveId, saves.id))
      .where(
        and(
          eq(tasks.op, "fetch_video_ytdlp"),
          eq(tasks.status, "done"),
          isNotNull(tasks.lastError),
          eq(saves.status, "complete"),
          isNull(saves.deletedAt),
        ),
      )
      .all()
      .flatMap(({ error, attempts, maxAttempts, ...row }) =>
        error
          ? [
              {
                ...row,
                videoDownload: { error, attempts, maxAttempts },
              },
            ]
          : [],
      );
  },
  async verifyIndex() {
    const { verifyLibraryIntegrity } = await import("../library-ops");
    return verifyLibraryIntegrity();
  },
  readCheck: store.read,
  writeCheck: store.write,
  async media() {
    const { mediaWarmSnapshot } = await import("../media-warm/service");
    return mediaWarmSnapshot();
  },
  folderExists: (saveId) => directoryExists(saveDir(saveId)),
});
