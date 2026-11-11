import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { type Save, saves } from "@pond/schema/db";
import {
  isAuxiliaryKind,
  isOriginalImageKind,
  isTextCardThumbnailPath,
  isThumbnailKind,
  thumbnailFilename,
} from "@shared/save-file-names";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type {
  LibraryRepairIssue,
  LibraryRepairKind,
} from "../../shared/library-repair-contracts";
import { getDb } from "../db";
import { libraryRoot, saveDirIn } from "../paths";
import {
  renderThumbnail,
  thumbnailLooksLikeSource,
  thumbnailSource,
} from "./save-thumbnail-file";
import {
  libraryMediaMetadata,
  readLibraryMedia,
  readLibraryMediaRange,
} from "./storage/library-media-storage";

type SaveFile = Save["files"][number];
export type IntegritySave = Pick<
  Save,
  "id" | "title" | "source" | "sourceId" | "url" | "files"
>;
export type RepairSave = IntegritySave & Pick<Save, "deletedAt">;

export interface InternalLibraryRepairIssue extends LibraryRepairIssue {
  fingerprint: string;
  action:
    | {
        kind: "thumbnail";
        source: string;
        destination: string;
      }
    | {
        kind: "physical-file-names";
        renames: Array<{ from: string; to: string }>;
      }
    | { kind: "invalid-content" }
    | { kind: "save-metadata" };
}

export interface LibraryIntegrityRuntime {
  root(): string;
  listSaves(): Promise<IntegritySave[]>;
  getSave(id: string): Promise<RepairSave | null>;
  inspectPayload(path: string, expected: SaveFile): Promise<PayloadInspection>;
  canRenderThumbnail(path: string): Promise<boolean>;
  /** Null when either image can't be decoded, so the scan never flags what it couldn't compare. */
  thumbnailMatchesSource?(
    thumbnailPath: string,
    sourcePath: string,
  ): Promise<boolean | null>;
  readInfo(path: string): Promise<InfoInspection>;
}

async function thumbnailMatchesSource(
  thumbnailPath: string,
  sourcePath: string,
): Promise<boolean | null> {
  const [thumbnail, source] = await Promise.all([
    readLibraryMedia(thumbnailPath).catch(() => null),
    readLibraryMedia(sourcePath).catch(() => null),
  ]);
  if (!thumbnail || !source) return null;
  return thumbnailLooksLikeSource(thumbnail, source);
}

export interface PayloadInspection {
  ok: boolean;
  size: number | null;
  sha256: string | null;
  reason: "ok" | "missing" | "unsafe" | "empty" | "size" | "hash" | "error";
}

export type InfoInspection =
  | { status: "valid"; value: RepairInfo; fingerprint: string }
  | { status: "invalid"; fingerprint: string }
  | { status: "missing" }
  | { status: "unreadable" };

const RepairInfoSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceId: z.string(),
  url: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      size: z.number(),
      sha256: z.string(),
    }),
  ),
});
type RepairInfo = z.infer<typeof RepairInfoSchema>;

const defaultRuntime: LibraryIntegrityRuntime = {
  root: libraryRoot,
  async listSaves() {
    const db = await getDb();
    return db.select().from(saves).where(isNull(saves.deletedAt)).all();
  },
  async getSave(id) {
    const db = await getDb();
    return db.select().from(saves).where(eq(saves.id, id)).get() ?? null;
  },
  inspectPayload,
  async canRenderThumbnail(path) {
    return (await renderThumbnail(path).catch(() => null)) !== null;
  },
  thumbnailMatchesSource,
  async readInfo(path) {
    let decoded: Buffer;
    try {
      decoded = await readFile(path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { status: "missing" };
      return { status: "unreadable" };
    }
    const fingerprint = createHash("sha256").update(decoded).digest("hex");
    let raw: unknown;
    try {
      raw = JSON.parse(decoded.toString("utf8"));
    } catch {
      return { status: "invalid", fingerprint };
    } finally {
      decoded.fill(0);
    }
    const parsed = RepairInfoSchema.safeParse(raw);
    return parsed.success
      ? { status: "valid", value: parsed.data, fingerprint }
      : { status: "invalid", fingerprint };
  },
};

export async function scanLibraryIntegrity(input: {
  kind: LibraryRepairKind;
  signal?: AbortSignal;
  onProgress?: (processed: number, total: number) => void;
  runtime?: LibraryIntegrityRuntime;
}): Promise<InternalLibraryRepairIssue[]> {
  const runtime = input.runtime ?? defaultRuntime;
  const rows = await runtime.listSaves();
  const issues: InternalLibraryRepairIssue[] = [];
  for (const [index, row] of rows.entries()) {
    throwIfAborted(input.signal);
    const issue = await inspectSaveIntegrity({
      kind: input.kind,
      row,
      runtime,
    });
    if (issue) issues.push(issue);
    input.onProgress?.(index + 1, rows.length);
  }
  return issues;
}

export async function inspectCurrentSaveIntegrity(input: {
  kind: LibraryRepairKind;
  saveId: string;
  runtime?: LibraryIntegrityRuntime;
}): Promise<InternalLibraryRepairIssue | null> {
  const runtime = input.runtime ?? defaultRuntime;
  const row = await runtime.getSave(input.saveId);
  if (!row) return null;
  return inspectSaveIntegrity({ kind: input.kind, row, runtime });
}

export async function inspectSaveIntegrity(input: {
  kind: LibraryRepairKind;
  row: IntegritySave;
  runtime: LibraryIntegrityRuntime;
}): Promise<InternalLibraryRepairIssue | null> {
  switch (input.kind) {
    case "thumbnails":
      return inspectThumbnail(input.row, input.runtime);
    case "physical-file-names":
      return inspectPhysicalNames(input.row, input.runtime);
    case "invalid-content":
      return inspectInvalidContent(input.row, input.runtime);
    case "save-metadata":
      return inspectSaveMetadata(input.row, input.runtime);
  }
}

async function inspectThumbnail(
  row: IntegritySave,
  runtime: LibraryIntegrityRuntime,
): Promise<InternalLibraryRepairIssue | null> {
  const directory = saveDirIn(runtime.root(), row.id);
  const thumbnails = row.files.filter((file) => isThumbnailKind(file.kind));
  const healthy: SaveFile[] = [];
  for (const thumbnail of thumbnails) {
    const inspection = await runtime.inspectPayload(
      safePayloadPath(directory, thumbnail.path),
      thumbnail,
    );
    if (
      inspection.ok &&
      (await runtime.canRenderThumbnail(
        safePayloadPath(directory, thumbnail.path),
      ))
    )
      healthy.push(thumbnail);
  }
  const sourceCandidate = thumbnailSource(row.files);
  if (!sourceCandidate) return null;
  const source = row.files.find(
    (file) =>
      file.path === sourceCandidate.path && file.kind === sourceCandidate.kind,
  );
  if (!source) return null;
  const sourcePath = safePayloadPath(directory, source.path);
  const mismatched =
    healthy.length > 0 &&
    (await thumbnailsMismatch(healthy, source, sourcePath, directory, runtime));
  if (healthy.length > 0 && !mismatched) return null;
  const sourceInspection = await runtime.inspectPayload(sourcePath, source);
  if (!sourceInspection.ok || !(await runtime.canRenderThumbnail(sourcePath)))
    return null;
  const destination = thumbnailFilename(source.path);
  const observed = {
    files: fileFacts(row.files),
    source: sourceInspection,
    thumbnails: await Promise.all(
      thumbnails.map((file) =>
        runtime.inspectPayload(safePayloadPath(directory, file.path), file),
      ),
    ),
    destination,
  };
  return issue({
    kind: "thumbnails",
    row,
    summary: mismatched
      ? "Thumbnail doesn't match this save"
      : thumbnails.length === 0
        ? "Thumbnail is missing"
        : "Thumbnail is damaged",
    detail: mismatched
      ? "The thumbnail shows a different image than this save's media. Pond makes a new one from the original file."
      : "Pond makes a new thumbnail from the original file.",
    observed,
    action: { kind: "thumbnail", source: source.path, destination },
  });
}

function isVisualMedia(file: SaveFile): boolean {
  return (
    file.kind === "poster" ||
    file.kind === "video" ||
    isOriginalImageKind(file.kind) ||
    file.mimeType?.startsWith("image/") === true ||
    file.mimeType?.startsWith("video/") === true
  );
}

/** A text card only renders for saves without visual media, so one beside a poster or image is stale. */
async function thumbnailsMismatch(
  thumbnails: SaveFile[],
  source: SaveFile,
  sourcePath: string,
  directory: string,
  runtime: LibraryIntegrityRuntime,
): Promise<boolean> {
  for (const thumbnail of thumbnails) {
    if (thumbnail.custom) return false;
    if (isTextCardThumbnailPath(thumbnail.path)) {
      if (isVisualMedia(source)) return true;
      continue;
    }
    const matches = await runtime.thumbnailMatchesSource?.(
      safePayloadPath(directory, thumbnail.path),
      sourcePath,
    );
    if (matches === false) return true;
  }
  return false;
}

async function inspectPhysicalNames(
  row: IntegritySave,
  runtime: LibraryIntegrityRuntime,
): Promise<InternalLibraryRepairIssue | null> {
  const directory = saveDirIn(runtime.root(), row.id);
  const occupied = new Set(row.files.map((file) => file.path.toLowerCase()));
  const changes: Array<{
    from: string;
    to: string;
    payload: PayloadInspection;
  }> = [];
  for (const file of row.files) {
    if (file.path !== basename(file.path) || validPhysicalName(file.path))
      continue;
    const payload = await runtime.inspectPayload(
      safePayloadPath(directory, file.path),
      file,
    );
    if (!payload.ok) continue;
    const to = availablePhysicalName(file.path, occupied);
    occupied.add(to.toLowerCase());
    changes.push({ from: file.path, to, payload });
  }
  if (changes.length === 0) return null;
  return issue({
    kind: "physical-file-names",
    row,
    summary:
      changes.length === 1
        ? "1 file name needs renaming"
        : `${changes.length} file names need renaming`,
    detail: changes.map((change) => `${change.from} → ${change.to}`).join(", "),
    observed: { files: fileFacts(row.files), changes },
    action: {
      kind: "physical-file-names",
      renames: changes.map(({ from, to }) => ({ from, to })),
    },
  });
}

async function inspectInvalidContent(
  row: IntegritySave,
  runtime: LibraryIntegrityRuntime,
): Promise<InternalLibraryRepairIssue | null> {
  const originals = row.files.filter((file) => !isAuxiliaryKind(file.kind));
  const directory = saveDirIn(runtime.root(), row.id);
  const payloads = await Promise.all(
    originals.map((file) =>
      runtime.inspectPayload(safePayloadPath(directory, file.path), file),
    ),
  );
  if (payloads.some((payload) => payload.ok)) return null;
  return issue({
    kind: "invalid-content",
    row,
    summary: "Files are missing or damaged",
    detail:
      originals.length === 0
        ? "This save has no original file."
        : "Every original file is missing, empty, or changed since it was saved.",
    observed: { files: fileFacts(row.files), payloads },
    action: { kind: "invalid-content" },
  });
}

async function inspectSaveMetadata(
  row: IntegritySave,
  runtime: LibraryIntegrityRuntime,
): Promise<InternalLibraryRepairIssue | null> {
  if (row.files.length === 0) return null;
  const directory = saveDirIn(runtime.root(), row.id);
  const payloads = await Promise.all(
    row.files.map((file) =>
      runtime.inspectPayload(safePayloadPath(directory, file.path), file),
    ),
  );
  if (payloads.some((payload) => !payload.ok)) return null;
  const info = await runtime.readInfo(join(directory, "info.json"));
  if (info.status === "valid" && metadataMatches(row, info.value)) return null;
  return issue({
    kind: "save-metadata",
    row,
    summary: "Save record is out of date",
    detail:
      "The record stored with this save is missing or doesn't match your library.",
    observed: { files: fileFacts(row.files), payloads, info },
    action: { kind: "save-metadata" },
  });
}

async function inspectPayload(
  path: string,
  expected: SaveFile,
): Promise<PayloadInspection> {
  try {
    const itemRoot = resolve(path, "..");
    const resolved = resolve(path);
    if (
      !resolved.startsWith(`${itemRoot}${sep}`) &&
      resolved !== join(itemRoot, basename(path))
    )
      return failedPayload("unsafe");
    const file = await lstat(path);
    if (!file.isFile() || file.isSymbolicLink()) return failedPayload("unsafe");
    const metadata = await libraryMediaMetadata(path);
    if (metadata.originalSize === 0) return failedPayload("empty");
    if (metadata.originalSize !== expected.size)
      return {
        ok: false,
        size: metadata.originalSize,
        sha256: null,
        reason: "size",
      };
    const hash = createHash("sha256");
    for await (const chunk of readLibraryMediaRange({
      path,
      start: 0,
      endExclusive: metadata.originalSize,
    })) {
      hash.update(chunk);
      chunk.fill(0);
    }
    const sha256 = hash.digest("hex");
    return {
      ok: !expected.sha256 || sha256 === expected.sha256,
      size: metadata.originalSize,
      sha256,
      reason: !expected.sha256 || sha256 === expected.sha256 ? "ok" : "hash",
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return failedPayload("missing");
    return failedPayload("error");
  }
}

function safePayloadPath(directory: string, path: string): string {
  const target = resolve(directory, path);
  const rel = relative(resolve(directory), target);
  if (!path || rel === ".." || rel.startsWith(`..${sep}`))
    return join(directory, "__unsafe_payload__");
  return target;
}

function failedPayload(
  reason: Exclude<PayloadInspection["reason"], "ok">,
): PayloadInspection {
  return { ok: false, size: null, sha256: null, reason };
}

function metadataMatches(row: IntegritySave, info: RepairInfo): boolean {
  return (
    info.id === row.id &&
    info.source === row.source &&
    info.sourceId === row.sourceId &&
    info.url === row.url &&
    JSON.stringify(info.files) ===
      JSON.stringify(
        row.files.map((file) => ({
          path: file.path,
          size: file.size,
          sha256: file.sha256,
        })),
      )
  );
}

function validPhysicalName(name: string): boolean {
  const stem = name.replace(/[. ]+$/u, "");
  if (!stem || [...name].some(invalidPhysicalCharacter) || stem !== name)
    return false;
  const base = stem.split(".")[0]?.toUpperCase() ?? "";
  return !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(base);
}

function availablePhysicalName(name: string, occupied: Set<string>): string {
  const extension = [...extname(name)]
    .filter((character) => !invalidPhysicalCharacter(character))
    .join("");
  const rawStem = name.slice(0, name.length - extname(name).length);
  let stem = rawStem
    .normalize("NFKC")
    .split("")
    .map((character) => (invalidPhysicalCharacter(character) ? "-" : character))
    .join("")
    .replace(/-+/gu, "-")
    .replace(/[. ]+$/gu, "")
    .slice(0, 180);
  if (!stem || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/iu.test(stem))
    stem = "file";
  let candidate = `${stem}${extension}`;
  let suffix = 2;
  while (occupied.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix}${extension}`;
    suffix += 1;
  }
  return candidate;
}

function invalidPhysicalCharacter(character: string): boolean {
  return character.charCodeAt(0) <= 31 || '<>:"/\\|?*'.includes(character);
}

function fileFacts(files: readonly SaveFile[]) {
  return files.map((file) => ({
    kind: file.kind,
    path: file.path,
    size: file.size,
    sha256: file.sha256,
  }));
}

function issue(input: {
  kind: LibraryRepairKind;
  row: IntegritySave;
  summary: string;
  detail: string;
  observed: unknown;
  action: InternalLibraryRepairIssue["action"];
}): InternalLibraryRepairIssue {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.kind,
        saveId: input.row.id,
        row: {
          title: input.row.title,
          source: input.row.source,
          sourceId: input.row.sourceId,
          url: input.row.url,
          files: fileFacts(input.row.files),
        },
        observed: input.observed,
      }),
    )
    .digest("hex");
  return {
    id: `${input.kind}:${input.row.id}`,
    kind: input.kind,
    saveId: input.row.id,
    title: input.row.title,
    summary: input.summary,
    detail: input.detail,
    fingerprint,
    action: input.action,
  };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Repair canceled.", "AbortError");
}

export const libraryIntegrityRuntime = defaultRuntime;
