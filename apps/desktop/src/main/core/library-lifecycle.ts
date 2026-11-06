import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readLibraryIdentity, updateLibraryIdentity } from "./library-identity";

const INVALID_NAME = /[/:\\]/;

export function libraryPathForName(source: string, name: string): string {
  const trimmed = name.trim().replace(/\.pond$/i, "");
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    INVALID_NAME.test(trimmed)
  )
    throw new Error("Choose a name without slashes or colons.");
  return join(dirname(source), `${trimmed}.pond`);
}

export async function renameLibraryBundle(
  source: string,
  name: string,
): Promise<{ path: string; previousName: string }> {
  const destination = libraryPathForName(source, name);
  const previousName = (await readLibraryIdentity(source)).name;
  if (destination === source) {
    updateLibraryIdentity(source, {
      name: name.trim().replace(/\.pond$/i, ""),
    });
    return { path: source, previousName };
  }
  const caseOnlyRename =
    destination.toLocaleLowerCase() === source.toLocaleLowerCase();
  if (existsSync(destination) && !caseOnlyRename)
    throw new Error("A library with that name already exists.");
  if (caseOnlyRename) {
    const temporary = `${source}.rename-${process.pid}`;
    await rename(source, temporary);
    try {
      await rename(temporary, destination);
    } catch (error) {
      await rename(temporary, source);
      throw error;
    }
  } else {
    await rename(source, destination);
  }
  try {
    updateLibraryIdentity(destination, {
      name: name.trim().replace(/\.pond$/i, ""),
    });
    return { path: destination, previousName };
  } catch (error) {
    await rename(destination, source);
    throw error;
  }
}

export async function rollbackLibraryRename(
  source: string,
  destination: string,
  previousName: string,
): Promise<void> {
  if (source !== destination) await rename(destination, source);
  updateLibraryIdentity(source, { name: previousName });
}

export async function removeMovedLibrarySource(
  source: string,
  destination: string,
): Promise<boolean> {
  if (source === destination) return true;
  if (!existsSync(destination)) return false;
  try {
    await rm(source, { recursive: true });
    return true;
  } catch {
    return false;
  }
}
