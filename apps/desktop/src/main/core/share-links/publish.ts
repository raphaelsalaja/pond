import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import type { SharePageKind } from "@pond/schema/share-page";
import type { ShareLink } from "../../../shared/share-link-contracts";
import type { ShareHost } from "./host";
import {
  patchShareLink,
  readShareLinks,
  removeShareLinkRecord,
  upsertShareLink,
} from "./records";

export interface ShareLinkTarget {
  ids: ReadonlyArray<string>;
  folderId?: string;
}

/** Everything publishing touches outside this module, so tests can run it against a fake bucket. */
export interface ShareLinkDeps {
  libraryRoot: string;
  host: ShareHost;
  /** Writes the Share Page for `target` into `destination`, which must not exist yet. */
  stage: (input: {
    target: ShareLinkTarget;
    destination: string;
    pageUrl: string;
  }) => Promise<{ exported: number }>;
  /** What the page will be called and what it is, without building it. */
  describe: (
    target: ShareLinkTarget,
  ) => Promise<{ kind: SharePageKind; title: string }>;
  now: () => number;
  /** Called after each file is uploaded; throws to stop the upload. */
  progress?: (key: string, bytes: number) => Promise<void>;
  /** Called once with the number of files about to upload. */
  phase?: (files: number) => Promise<void>;
}

const CONTENT_TYPES = new Map([
  ["html", "text/html; charset=utf-8"],
  ["webp", "image/webp"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["gif", "image/gif"],
  ["svg", "image/svg+xml"],
  ["mp4", "video/mp4"],
  ["m4v", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
]);

/** The page itself is never cached, so an update or Stop Sharing shows up right away; media caches for an hour. */
const PAGE_CACHE = "no-cache";
const MEDIA_CACHE = "public, max-age=3600";

/** 128 random bits as 26 lowercase base32 characters. */
export function newShareLinkId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = randomBytes(17);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/** A Folder's link is the Folder's; a selection's is the same Saves in the same order. */
export function sameTarget(link: ShareLink, target: ShareLinkTarget): boolean {
  if (target.folderId || link.target.folderId) {
    return target.folderId === link.target.folderId;
  }
  return (
    link.target.ids.length === target.ids.length &&
    link.target.ids.every((id, index) => id === target.ids[index])
  );
}

export interface PublishInput {
  target: ShareLinkTarget;
  /**
   * An existing link republishes its own target; an unknown one becomes the new link's id, so a
   * job can name its link before it starts. Without it, a link for the same target is reused.
   */
  id?: string;
  /** Used only for a new link. */
  expiresAt?: number | null;
}

/**
 * Builds a fresh Share Page and uploads it under the link's id: media first, the page last, so
 * the address never shows a page whose files aren't there yet. Files the new page no longer
 * needs are removed afterwards.
 */
export async function publishShareLink(
  deps: ShareLinkDeps,
  input: PublishInput,
): Promise<{ link: ShareLink; updated: boolean }> {
  const links = await readShareLinks(deps.libraryRoot);
  const existing = input.id
    ? links.find((link) => link.id === input.id)
    : links.find((link) => sameTarget(link, input.target));
  const target = existing && input.id ? existing.target : input.target;
  const id = existing?.id ?? input.id ?? newShareLinkId();
  const url = deps.host.publicUrl(`${id}/index.html`);
  const { kind, title } = await deps.describe(target);
  const now = deps.now();
  await upsertShareLink(deps.libraryRoot, {
    id,
    kind,
    title,
    target: { ids: [...target.ids], folderId: target.folderId },
    url,
    status: "uploading",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    expiresAt: existing ? existing.expiresAt : (input.expiresAt ?? null),
    saves: existing?.saves ?? 0,
    bytes: existing?.bytes ?? 0,
    keys: existing?.keys ?? [],
  });

  const scratch = await mkdtemp(join(tmpdir(), "pond-share-link-"));
  const uploaded: Array<string> = [];
  try {
    const page = join(scratch, "page");
    const { exported } = await deps.stage({
      target,
      destination: page,
      pageUrl: url,
    });
    const files = (await listFiles(page)).sort(
      (a, b) => Number(a === "index.html") - Number(b === "index.html"),
    );
    await deps.phase?.(files.length);
    let bytes = 0;
    for (const file of files) {
      const body = await readFile(join(page, file));
      const key = `${id}/${file}`;
      await deps.host.put(key, body, {
        contentType:
          CONTENT_TYPES.get(file.split(".").pop() ?? "") ??
          "application/octet-stream",
        cacheControl: file === "index.html" ? PAGE_CACHE : MEDIA_CACHE,
      });
      uploaded.push(key);
      bytes += body.byteLength;
      await deps.progress?.(key, body.byteLength);
    }
    const stale = (existing?.keys ?? []).filter(
      (key) => !uploaded.includes(key),
    );
    await Promise.all(
      stale.map((key) => deps.host.remove(key).catch(() => undefined)),
    );
    const link = await patchShareLink(deps.libraryRoot, id, {
      status: "live",
      error: undefined,
      updatedAt: deps.now(),
      saves: exported,
      bytes,
      keys: uploaded,
    });
    if (!link)
      throw new Error("This Share Link was stopped while it uploaded.");
    return { link, updated: existing !== undefined };
  } catch (error) {
    /** A link that was never live takes its partial upload with it; a live one keeps what it had. */
    const keep = new Set(existing?.keys ?? []);
    await Promise.all(
      uploaded.flatMap((key) =>
        keep.has(key) ? [] : [deps.host.remove(key).catch(() => undefined)],
      ),
    );
    await patchShareLink(deps.libraryRoot, id, {
      status: "failed",
      error: error instanceof Error ? error.message : "The upload stopped.",
      updatedAt: deps.now(),
      keys: existing?.keys ?? [],
    });
    throw error;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** Removes every file under the link's id, including any a failed upload left, then forgets it. */
export async function stopSharing(
  deps: Pick<ShareLinkDeps, "libraryRoot" | "host">,
  id: string,
): Promise<void> {
  const link = (await readShareLinks(deps.libraryRoot)).find(
    (entry) => entry.id === id,
  );
  if (!link) return;
  const keys = new Set([...link.keys, ...(await deps.host.list(`${id}/`))]);
  for (const key of keys) await deps.host.remove(key);
  await removeShareLinkRecord(deps.libraryRoot, id);
}

/** Stops every link whose expiry has passed. Returns the ones it stopped and the ones it couldn't. */
export async function stopExpiredShareLinks(
  deps: Pick<ShareLinkDeps, "libraryRoot" | "host" | "now">,
): Promise<{
  stopped: Array<ShareLink>;
  failed: Array<{ link: ShareLink; error: Error | null }>;
}> {
  const now = deps.now();
  const due = (await readShareLinks(deps.libraryRoot)).filter(
    (link) =>
      link.expiresAt !== null &&
      link.expiresAt <= now &&
      link.status !== "uploading",
  );
  const stopped: Array<ShareLink> = [];
  const failed: Array<{ link: ShareLink; error: Error | null }> = [];
  for (const link of due) {
    try {
      await stopSharing(deps, link.id);
      stopped.push(link);
    } catch (error) {
      failed.push({ link, error: error instanceof Error ? error : null });
    }
  }
  return { stopped, failed };
}

async function listFiles(directory: string): Promise<Array<string>> {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(directory, join(entry.parentPath, entry.name))
        .split(sep)
        .join("/"),
    );
}
