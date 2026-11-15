import { createHash } from "node:crypto";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { CaptureMetadata } from "@pond/schema/capture";
import { saves } from "@pond/schema/db";
import type { ExtensionCookie } from "@pond/schema/session";
import { and, eq } from "drizzle-orm";
import { session } from "electron";
import mime from "mime-types";
import { getDb } from "../db";
import { saveDir } from "../paths";
import { createManualSave, importedFilesComplete } from "./manual-import";
import { writePartitionCookies } from "./refresh/harvest-window/session";
import { restoreSave } from "./restore-save";

/** Chromium cancels a Referer that breaks strict-origin-when-cross-origin with ERR_BLOCKED_BY_CLIENT. */
export function referrerFor(
  originUrl: string,
  targetUrl: string,
): string | undefined {
  let origin: URL;
  let target: URL;
  try {
    origin = new URL(originUrl);
    target = new URL(targetUrl);
  } catch {
    return undefined;
  }
  if (origin.origin === target.origin) return originUrl;
  if (origin.protocol === "https:" && target.protocol === "http:")
    return undefined;
  return origin.origin;
}

export async function captureAsset(input: {
  url: string;
  title?: string;
  originUrl?: string;
  metadata: CaptureMetadata;
  cookies?: ExtensionCookie[];
}): Promise<{ id: string; duplicate: boolean }> {
  const sourceId = `asset:${createHash("sha256").update(input.url).digest("hex")}`;
  const db = await getDb();
  const existing = db
    .select({
      id: saves.id,
      files: saves.files,
      status: saves.status,
      deletedAt: saves.deletedAt,
    })
    .from(saves)
    .where(and(eq(saves.source, "web"), eq(saves.sourceId, sourceId)))
    .get();
  const restored = existing?.deletedAt != null;
  if (existing && restored) await restoreSave(existing.id, "capture:restore");
  if (
    existing &&
    (await importedFilesComplete(existing, saveDir(existing.id), 1))
  )
    return { id: existing.id, duplicate: !restored };
  const directory = await mkdtemp(join(tmpdir(), "pond-asset-"));
  const partition = `pond-asset-${crypto.randomUUID()}`;
  const isolated = session.fromPartition(partition, { cache: false });
  try {
    if (input.cookies?.length)
      await writePartitionCookies({ partition, cookies: input.cookies });
    const referrer = input.originUrl
      ? referrerFor(input.originUrl, input.url)
      : undefined;
    const response = await isolated.fetch(input.url, {
      signal: AbortSignal.timeout(60_000),
      headers: referrer ? { Referer: referrer } : undefined,
    });
    if (!response.ok)
      throw new Error(
        `The image server returned ${response.status}. Open the page and try again.`,
      );
    const type = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!type.startsWith("image/"))
      throw new Error(
        "This image link no longer returns an image. Open the page and select it again.",
      );
    const extension = mime.extension(type) || "image";
    const name =
      basename(new URL(input.url).pathname)
        .replace(/[^a-zA-Z0-9_.-]/g, "_")
        .slice(0, 120) || `image.${extension}`;
    const file = join(
      directory,
      `${basename(name, extname(name))}.${extension}`,
    );
    const handle = await open(file, "wx");
    try {
      const reader = response.body?.getReader();
      if (!reader) throw new Error("The image server returned no data.");
      let total = 0;
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          total += next.value.byteLength;
          if (total > 128 * 1024 * 1024)
            throw new Error(
              "This image exceeds the 128 MB capture limit. Download and import the file instead.",
            );
          await handle.writeFile(next.value);
        }
      } finally {
        await reader.cancel();
      }
    } finally {
      await handle.close();
    }
    const result = await createManualSave({
      source: "web",
      sourceId,
      url: input.originUrl || input.url,
      title: input.metadata.title || input.title,
      filePaths: [file],
      fileSourceUrls: [input.url],
      tags: input.metadata.tags,
      note: input.metadata.notes,
      rating: input.metadata.rating,
      inboxChannel: "captures",
    });
    if (!result.ok) throw new Error(result.error);
    return { id: result.id, duplicate: Boolean(result.skipped) };
  } finally {
    await Promise.allSettled([
      isolated.clearStorageData(),
      isolated.closeAllConnections(),
      rm(directory, { recursive: true, force: true }),
    ]);
  }
}
