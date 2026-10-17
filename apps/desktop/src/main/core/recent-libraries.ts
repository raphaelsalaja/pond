import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { app } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { writeLibraryPointer } from "../lib/library-pointer";
import { renameSyncWithRetry } from "../lib/rename-retry";
import { readLibraryIdentity } from "./library-identity";

const RecentLibrariesSchema = z.array(
  z.object({
    path: z.string(),
    lastOpened: z.number(),
    icon: z.string().optional(),
    hidden: z.boolean().optional(),
  }),
);

function readHistory(file: string) {
  if (!existsSync(file)) return [];
  return RecentLibrariesSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

function writeHistory(
  file: string,
  history: z.infer<typeof RecentLibrariesSchema>,
): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(history, null, 2));
  renameSyncWithRetry(`${file}.tmp`, file);
}

export function recordRecentLibrary(
  file: string,
  path: string,
  now = Date.now(),
): void {
  const normalized = resolve(path);
  const previous = readHistory(file);
  const existing = previous.find((entry) => entry.path === normalized);
  const history = [
    { path: normalized, lastOpened: now, icon: existing?.icon },
    ...previous.filter((entry) => entry.path !== normalized),
  ].slice(0, 12);
  writeHistory(file, history);
}

export function commitLibraryPointer(absPath: string): void {
  writeLibraryPointer(absPath);
  try {
    recordRecentLibrary(
      join(app.getPath("userData"), "recent-libraries.json"),
      absPath,
    );
  } catch (error) {
    log.warn("Could not record the recent library", error);
  }
}

export function setRecentLibraryIcon(
  file: string,
  path: string,
  icon: string | null,
): void {
  const normalized = resolve(path);
  const previous = readHistory(file);
  const existing = previous.find((entry) => entry.path === normalized);
  if (!existing) {
    writeHistory(file, [
      { path: normalized, lastOpened: 0, icon: icon ?? undefined },
      ...previous,
    ]);
    return;
  }
  writeHistory(
    file,
    previous.map((entry) =>
      entry.path === normalized ? { ...entry, icon: icon ?? undefined } : entry,
    ),
  );
}

export function removeRecentLibrary(file: string, path: string): void {
  const normalized = resolve(path);
  const previous = readHistory(file);
  const existing = previous.find((entry) => entry.path === normalized);
  if (!existing) {
    writeHistory(file, [
      { path: normalized, lastOpened: 0, hidden: true },
      ...previous,
    ]);
    return;
  }
  writeHistory(
    file,
    previous.map((entry) =>
      entry.path === normalized ? { ...entry, hidden: true } : entry,
    ),
  );
}

export function renameRecentLibrary(
  file: string,
  previousPath: string,
  nextPath: string,
): void {
  const previous = resolve(previousPath);
  const next = resolve(nextPath);
  const history = readHistory(file);
  const nextExists = history.some((entry) => entry.path === next);
  writeHistory(
    file,
    history
      .filter((entry) => !nextExists || entry.path !== previous)
      .map((entry) =>
        entry.path === previous ? { ...entry, path: next } : entry,
      ),
  );
}

export async function listRecentLibraries(file: string, activePath: string) {
  const active = resolve(activePath);
  const history = readHistory(file);
  if (!history.some((entry) => entry.path === active))
    history.unshift({ path: active, lastOpened: 0 });
  return Promise.all(
    history
      .filter((entry) => !entry.hidden)
      .map(async (entry) => {
        const available = Boolean(
          await stat(join(entry.path, "metadata.json")).catch(() => null),
        );
        const identity = available ? readLibraryIdentity(entry.path) : null;
        return {
          path: entry.path,
          lastOpened: entry.lastOpened,
          icon: identity?.icon ?? entry.icon ?? null,
          accent: identity?.accent ?? null,
          name: identity?.name ?? basename(entry.path).replace(/\.pond$/i, ""),
          active: entry.path === active,
          available,
        };
      }),
  );
}
