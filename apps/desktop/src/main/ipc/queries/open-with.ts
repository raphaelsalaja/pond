import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { saves } from "@pond/schema/db";
import { inArray } from "drizzle-orm";
import { app, BrowserWindow, clipboard, dialog, nativeImage } from "electron";
import type { NativeImage } from "electron";
import { z } from "zod";
import { librarySaveLink } from "../../../shared/library-links";
import type { QueryResult } from "../../../shared/query-contracts";
import { runLibraryTransfer } from "../../core/library-transfers";
import { savesPrompt } from "../../core/save-prompt";
import { getDb } from "../../db";
import {
  openWithListingKey,
  parseOpenWithPayload,
  rankOpenWithApps,
} from "../../lib/open-with-apps";
import type { OpenWithAppInfo } from "../../lib/open-with-apps";
import { libraryId as activeLibraryId } from "../../paths";
import { resolveOriginalFilePaths, resolveSaveFilePath } from "../helpers";
import { query } from "./params";
import type { QueryHandlerMap } from "./params";

const run = promisify(execFile);
const listedAppsByKind = new Map<string, Array<OpenWithAppInfo>>();
const iconByPath = new Map<string, string | null>();

async function resolveFiles(
  ids: Array<string>,
  fileIndex: number | undefined,
): Promise<{ ok: true; files: Array<string> } | { ok: false; error: string }> {
  const files: Array<string> = [];
  for (const id of new Set(ids)) {
    const target = await resolveSaveFilePath(id, fileIndex);
    if (!target.ok) {
      return {
        ok: false,
        error: "A selected Save has no available original file.",
      };
    }
    files.push(target.path);
  }
  return { ok: true, files };
}

async function listMacApps(filePath: string) {
  const script = `ObjC.import("AppKit");
const url = $.NSURL.fileURLWithPath(${JSON.stringify(filePath)});
const workspace = $.NSWorkspace.sharedWorkspace;
const fallback = workspace.URLForApplicationToOpenURL(url);
const apps = workspace.URLsForApplicationsToOpenURL(url);
const paths = [];
const count = Number(apps.count);
for (let i = 0; i < count; i++) paths.push(ObjC.unwrap(apps.objectAtIndex(i).path));
JSON.stringify({ defaultPath: fallback ? ObjC.unwrap(fallback.path) : null, paths });`;
  const { stdout } = await run(
    "/usr/bin/osascript",
    ["-l", "JavaScript", "-e", script],
    { timeout: 8000 },
  );
  return rankOpenWithApps(parseOpenWithPayload(stdout.trim()));
}

async function listedApps(filePath: string): Promise<Array<OpenWithAppInfo>> {
  const key = openWithListingKey(filePath);
  const cached = listedAppsByKind.get(key);
  if (cached) return cached;
  const ranked = await listMacApps(filePath);
  listedAppsByKind.set(key, ranked);
  return ranked;
}

const ICON_SOURCE_PX = 32;

async function cachedAppIcon(path: string): Promise<string | null> {
  const cached = iconByPath.get(path);
  if (cached !== undefined) return cached;
  const icon = await readAppIcon(path);
  iconByPath.set(path, icon);
  return icon;
}

async function readAppIcon(path: string): Promise<string | null> {
  const fromQuickLook = await thumbnailIcon(path);
  if (fromQuickLook) return fromQuickLook;
  try {
    const image = await app.getFileIcon(path, { size: "normal" });
    return encodeIcon(image);
  } catch {
    return null;
  }
}

async function thumbnailIcon(path: string): Promise<string | null> {
  try {
    const image = await nativeImage.createThumbnailFromPath(path, {
      width: ICON_SOURCE_PX,
      height: ICON_SOURCE_PX,
    });
    return encodeIcon(image);
  } catch {
    return null;
  }
}

function encodeIcon(image: NativeImage): string | null {
  if (image.isEmpty()) return null;
  const sized = image.resize({
    width: ICON_SOURCE_PX,
    height: ICON_SOURCE_PX,
    quality: "best",
  });
  if (sized.isEmpty()) return null;
  return sized.toDataURL();
}

async function openFilesWith(
  files: Array<string>,
  application: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    for (let offset = 0; offset < files.length; offset += 100) {
      await run("/usr/bin/open", [
        "-a",
        application,
        ...files.slice(offset, offset + 100),
      ]);
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not open the selected application.",
    };
  }
}

export const openWithQueries = {
  "saves.quickLook": query(
    z.object({
      id: z.string().min(1),
      fileIndex: z.number().int().nonnegative().optional(),
    }),
    async ({ id, fileIndex }, event) => {
      if (process.platform !== "darwin") {
        return { ok: false as const, error: "Quick Look requires macOS." };
      }
      const target = await resolveSaveFilePath(id, fileIndex);
      if (!target.ok) {
        return { ok: false as const, error: "This Save has no original file." };
      }
      const window =
        (event ? BrowserWindow.fromWebContents(event.sender) : null) ??
        BrowserWindow.getFocusedWindow();
      if (window) window.previewFile(target.path);
      else execFile("/usr/bin/qlmanage", ["-p", target.path]).unref();
      return { ok: true as const };
    },
  ),
  "saves.copyInternalLinks": query(
    z.object({ ids: z.array(z.string().min(1)).min(1) }),
    async ({ ids }) => {
      const libraryId = activeLibraryId();
      await clipboard.writeText(
        [...new Set(ids)]
          .map((id) => librarySaveLink(libraryId, id))
          .join("\n"),
      );
      return { ok: true };
    },
  ),
  "saves.copyPrompt": query(
    z.object({ ids: z.array(z.string().min(1)).min(1) }),
    async ({ ids }) => {
      const unique = [...new Set(ids)];
      const db = await getDb();
      const rows = await db
        .select()
        .from(saves)
        .where(inArray(saves.id, unique));
      const byId = new Map(rows.map((row) => [row.id, row]));
      const libraryId = activeLibraryId();
      const entries = unique.flatMap((id) => {
        const row = byId.get(id);
        if (!row) return [];
        return [
          {
            save: row,
            link: librarySaveLink(libraryId, id),
            files: resolveOriginalFilePaths(id, row.files),
          },
        ];
      });
      if (!entries.length) {
        return { ok: false as const, error: "not_found" };
      }
      await clipboard.writeText(savesPrompt(entries));
      return { ok: true as const };
    },
  ),
  "saves.listOpenWith": query(
    z.object({
      ids: z.array(z.string()).min(1),
      fileIndex: z.number().int().nonnegative().optional(),
      includeIcons: z.boolean().optional(),
    }),
    async ({ ids, fileIndex, includeIcons }) => {
      if (process.platform !== "darwin") return { apps: [] };
      const target = await resolveSaveFilePath(ids[0] ?? "", fileIndex);
      if (!target.ok) return { apps: [] };
      try {
        const file = target.path;
        const ranked = await listedApps(file);
        const apps = await Promise.all(
          ranked.map(async (entry) => ({
            ...entry,
            icon: includeIcons
              ? await cachedAppIcon(entry.path)
              : (iconByPath.get(entry.path) ?? null),
          })),
        );
        return { apps };
      } catch {
        return { apps: [] };
      }
    },
  ),
  "saves.openWith": query(
    z.object({
      ids: z.array(z.string()).min(1),
      fileIndex: z.number().int().nonnegative().optional(),
      application: z.string().min(1).optional(),
    }),
    async ({ ids, fileIndex, application }) =>
      runLibraryTransfer(async (): Promise<QueryResult<"saves.openWith">> => {
        const resolved = await resolveFiles(ids, fileIndex);
        if (!resolved.ok) return resolved;
        const { files } = resolved;
        try {
          if (process.platform === "win32") {
            for (const file of files) {
              await run("rundll32.exe", ["shell32.dll,OpenAs_RunDLL", file]);
            }
            return { ok: true };
          }
          if (process.platform !== "darwin") {
            return {
              ok: false,
              error:
                "Choose an application from your file manager to open this Save.",
            };
          }
          if (application) {
            if (!application.endsWith(".app") || !existsSync(application)) {
              return { ok: false, error: "Could not find that application." };
            }
            return await openFilesWith(files, application);
          }
          const picked = await dialog.showOpenDialog({
            title: "Open With",
            buttonLabel: "Open",
            defaultPath: "/Applications",
            properties: ["openFile"],
            filters: [{ name: "Applications", extensions: ["app"] }],
          });
          if (picked.canceled || !picked.filePaths[0]) {
            return { ok: false, reason: "cancelled" };
          }
          return await openFilesWith(files, picked.filePaths[0]);
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not open the selected application.",
          };
        }
      }),
  ),
} satisfies QueryHandlerMap;
