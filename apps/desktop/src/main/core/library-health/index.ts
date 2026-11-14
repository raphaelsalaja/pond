import { join } from "node:path";
import { saves } from "@pond/schema/db";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { appDataRoot } from "../../paths";
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
});
