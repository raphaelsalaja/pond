import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { isPathInside, isSamePath } from "../lib/path-identity";

const MANIFEST = "pond-backup-manifest.json";
const BackupEntrySchema = z.object({
  path: z.string(),
  size: z.number(),
  sha256: z.string(),
});
const BackupManifestSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  files: z.array(BackupEntrySchema),
});
type BackupEntry = z.infer<typeof BackupEntrySchema>;
const SaveFilesSchema = z.object({
  id: z.string().min(1),
  files: z.array(
    z.object({ path: z.string().min(1), size: z.number(), sha256: z.string() }),
  ),
});

async function checksum(path: string) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { sha256: hash.digest("hex"), size };
}

async function inventory(
  root: string,
  directory = root,
): Promise<BackupEntry[]> {
  const files: BackupEntry[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (path === join(root, MANIFEST)) continue;
    if (entry.isSymbolicLink())
      throw new Error(
        `Backup cannot include a symbolic link: ${relative(root, path)}`,
      );
    if (entry.isDirectory()) files.push(...(await inventory(root, path)));
    else if (entry.isFile())
      files.push({
        path: relative(root, path).split(sep).join("/"),
        ...(await checksum(path)),
      });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function sameInventory(
  before: readonly BackupEntry[],
  after: readonly BackupEntry[],
) {
  return (
    before.length === after.length &&
    before.every((file, index) => {
      const other = after[index];
      return (
        other?.path === file.path &&
        other.size === file.size &&
        other.sha256 === file.sha256
      );
    })
  );
}

async function validateReferences(root: string, files: readonly BackupEntry[]) {
  const indexed = new Map(files.map((file) => [file.path, file]));
  if (!indexed.has("metadata.json"))
    throw new Error(
      "This is not a complete Pond library: metadata.json is missing.",
    );
  for (const name of ["metadata.json", "settings.json", "tags.json"]) {
    if (indexed.has(name)) {
      const path = join(root, name);
      JSON.parse(await readFile(path, "utf8"));
    }
  }
  for (const entry of files) {
    if (
      !/(?:^|[/\\])(?:items|trash)[/\\].+\.info[/\\]info\.json$/.test(
        entry.path,
      )
    )
      continue;
    const infoPath = join(root, entry.path);
    const item = SaveFilesSchema.parse(
      JSON.parse(await readFile(infoPath, "utf8")),
    );
    const directory = dirname(entry.path);
    for (const file of item.files) {
      const path = resolve(root, directory, file.path);
      if (!path.startsWith(`${resolve(root, directory)}${sep}`))
        throw new Error(`Unsafe original path in Save ${item.id}.`);
      const original = indexed.get(relative(root, path).split(sep).join("/"));
      if (
        !original ||
        original.size !== file.size ||
        (file.sha256 && original.sha256 !== file.sha256)
      )
        throw new Error(
          `An original is missing or damaged in Save ${item.id}: ${file.path}`,
        );
    }
  }
}

export async function verifyLibraryBackup(directory: string) {
  const root = await realpath(directory);
  const files = await inventory(root);
  await validateReferences(root, files);
  const manifestFile = join(root, MANIFEST);
  const exists = await stat(manifestFile).catch(() => null);
  if (exists) {
    const manifest = BackupManifestSchema.parse(
      JSON.parse(await readFile(manifestFile, "utf8")),
    );
    if (!sameInventory(manifest.files, files))
      throw new Error(
        "The backup is incomplete or changed since it was created.",
      );
  }
  return { files: files.length, verifiedManifest: Boolean(exists) };
}

export async function createLibraryBackup(input: {
  source: string;
  destination: string;
  onProgress?: (copied: number, total: number) => void | Promise<void>;
}) {
  const source = await realpath(input.source);
  const parent = await realpath(dirname(resolve(input.destination)));
  const destination = join(parent, basename(resolve(input.destination)));
  if (
    isSamePath(destination, source) ||
    isPathInside(source, destination) ||
    isPathInside(destination, source)
  )
    throw new Error("The backup must be outside the source library.");
  const existing = await lstat(destination).catch(() => null);
  if (
    existing &&
    (!existing.isDirectory() || (await readdir(destination)).length > 0)
  )
    throw new Error("The backup destination already contains files.");
  const staging = await mkdtemp(join(parent, ".pond-backup-"));
  try {
    const before = await inventory(source);
    await validateReferences(source, before);
    let copied = 0;
    for (const file of before) {
      const target = join(staging, file.path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(source, file.path), target);
      copied += 1;
      await input.onProgress?.(copied, before.length);
    }
    const after = await inventory(source);
    const copiedFiles = await inventory(staging);
    if (!sameInventory(before, after) || !sameInventory(before, copiedFiles))
      throw new Error(
        "The library changed during backup. Try again when imports and edits finish.",
      );
    await validateReferences(staging, copiedFiles);
    await writeFile(
      join(staging, MANIFEST),
      JSON.stringify(
        { version: 1, createdAt: new Date().toISOString(), files: copiedFiles },
        null,
        2,
      ),
      { flag: "wx" },
    );
    await rename(staging, destination);
    return { copied, path: destination };
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreLibraryBackup(input: {
  source: string;
  destination: string;
}) {
  await verifyLibraryBackup(input.source);
  const restored = await createLibraryBackup(input);
  await verifyLibraryBackup(input.source);
  await rm(join(restored.path, MANIFEST));
  return restored;
}
