import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { folders, saves } from "@pond/schema/db";
import type { SharePageKind } from "@pond/schema/share-page";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { safeName } from "../export-files";
import { runLibraryTransfer } from "../library-transfers";
import { binariesAvailable } from "../refresh/binaries";
import {
  checkTransferCancellation,
  transferPhase,
  transferProgress,
} from "../transfer-jobs";
import { sharePageHtml } from "./html";
import type { SharePageViewer } from "./html";
import {
  DEFAULT_SHARE_PAGE_OPTIONS,
  assembleManifest,
  mediaJobs,
  planSharePage,
} from "./plan";
import type { SharePageOptions, SharePageSaveRow } from "./plan";
import { stageMedia, saveFilePath } from "./stage";

export interface SharePageTarget {
  /** In page order. */
  ids: ReadonlyArray<string>;
  /** Set when the page is a Folder: it takes the Folder's name. */
  folderId?: string;
}

interface ResolvedTarget {
  kind: SharePageKind;
  title: string;
  rows: Array<SharePageSaveRow>;
}

/** Reads the live Saves in the order given; Saves in Trash are never published. */
export async function resolveSharePageTarget(
  target: SharePageTarget,
): Promise<ResolvedTarget> {
  const db = await getDb();
  const found = target.ids.length
    ? await db
        .select()
        .from(saves)
        .where(inArray(saves.id, [...target.ids]))
    : [];
  const byId = new Map(
    found.filter((row) => !row.deletedAt).map((row) => [row.id, row]),
  );
  const rows = target.ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  if (rows.length === 0) throw new Error("Choose Saves to export.");

  if (target.folderId) {
    const [folder] = await db
      .select({ name: folders.name })
      .from(folders)
      .where(eq(folders.id, target.folderId));
    return { kind: "folder", title: folder?.name ?? "Folder", rows };
  }
  const only = rows.length === 1 ? rows[0] : undefined;
  if (only) {
    return {
      kind: "save",
      title: only.title || only.author || "Save",
      rows,
    };
  }
  return { kind: "selection", title: `${rows.length} Saves`, rows };
}

/** Names the page's folder after what it holds, e.g. "References (Pond Share Page 2026-11-27)". */
export function sharePageFolderName(title: string, now = new Date()): string {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  return `${safeName(title)} (Pond Share Page ${date})`;
}

export interface ExportSharePageInput {
  target: SharePageTarget;
  destination: string;
  libraryRoot: string;
  viewer: SharePageViewer;
  options?: SharePageOptions;
  now?: Date;
  /** Set when the page will live at a public address, for link previews. */
  pageUrl?: string;
}

/**
 * Builds the page in a hidden sibling folder and moves it into place at the end, so a
 * cancelled or failed export never leaves a half-written page behind.
 */
export function exportSharePage(input: ExportSharePageInput) {
  return runLibraryTransfer(async () => {
    const resolved = await resolveSharePageTarget(input.target);
    const plan = planSharePage({
      kind: resolved.kind,
      title: resolved.title,
      rows: resolved.rows,
      options: input.options ?? DEFAULT_SHARE_PAGE_OPTIONS,
      now: input.now ?? new Date(),
    });
    const jobs = mediaJobs(plan);
    const staging = join(
      dirname(input.destination),
      `.${basename(input.destination)}.${randomBytes(4).toString("hex")}.partial`,
    );
    await mkdir(staging, { recursive: true });
    try {
      await transferPhase("Preparing media", jobs.length);
      const staged = await stageMedia({
        jobs,
        directory: staging,
        source: (job) => saveFilePath(input.libraryRoot, job),
        ffmpeg: binariesAvailable().ffmpeg,
        beforeJob: checkTransferCancellation,
        afterJob: (job) => transferProgress(job.to),
      });
      const manifest = assembleManifest(plan, staged);
      await writeFile(
        join(staging, "index.html"),
        sharePageHtml(manifest, input.viewer, { pageUrl: input.pageUrl }),
        "utf8",
      );
      checkTransferCancellation();
      await rename(staging, input.destination);
      return { exported: manifest.saves.length, path: input.destination };
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  });
}
