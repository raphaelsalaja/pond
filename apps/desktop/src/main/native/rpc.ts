import type { ExtensionSettings } from "@pond/schema/browser-extension";
import type { CaptureReceipt, CaptureWebDraft } from "@pond/schema/capture";
import type { Source } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import { type NativeResponse, nativeRequestSchema } from "@pond/schema/native";
import type {
  ExtensionCookie,
  SessionImportResponse,
  SessionRefreshResponse,
} from "@pond/schema/session";
import log from "electron-log/main.js";
import { UnsupportedError } from "../core/pipeline/extractors/errors";
import type { LibraryInfo } from "../ops/library";

export interface EnqueueOpts {
  trigger?: string;
  cookies?: ExtensionCookie[];
}

export interface EnqueueResult {
  id: string;
  created: boolean;
  reseeded?: boolean;
  restored?: boolean;
}

export interface NativeFolder {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
}

export interface NativeTag {
  name: string;
  starred: boolean;
  usageCount: number;
  lastUsedAt: number | null;
}

export interface NativeFish {
  id: string;
  name: string;
}

export interface NativePorts {
  capture?: (
    draft: CaptureWebDraft,
    cookies?: ExtensionCookie[],
    fishId?: string,
  ) => Promise<CaptureReceipt>;
  captureStatus?: (id: string) => Promise<CaptureReceipt>;
  enqueue: (url: string, opts: EnqueueOpts) => Promise<EnqueueResult>;
  libraryInfo: () => Promise<LibraryInfo>;
  foldersList?: () => Promise<NativeFolder[]>;
  tagsList?: () => Promise<NativeTag[]>;
  fishList?: () => Promise<NativeFish[]>;
  extensionSettings?: () => Promise<ExtensionSettings>;
  sessionPending: () => { source: Source } | null;
  sessionImport: (
    source: Source,
    cookies: ExtensionCookie[],
  ) => Promise<SessionImportResponse>;
  sessionRefresh?: (
    source: Source,
    cookies: ExtensionCookie[],
  ) => Promise<SessionRefreshResponse>;
  importSharedFiles?: (paths: string[]) => Promise<{ ids: string[] }>;
  appVersion: () => string;
}

let lastContactAt: number | null = null;

/** When any browser extension last reached Pond, so Connect can tell a silent extension from a slow sign-in. */
export function lastNativeContactAt(): number | null {
  return lastContactAt;
}

export async function dispatchNative(
  raw: JsonValue,
  ports: NativePorts,
): Promise<NativeResponse> {
  lastContactAt = Date.now();
  const parsed = nativeRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const req = parsed.data;
  try {
    switch (req.type) {
      case "capture.accept":
        if (!ports.capture) return { ok: false, error: "capture_unavailable" };
        return {
          ok: true,
          data: await ports.capture(req.draft, req.cookies, req.fishId),
        };
      case "capture.status":
        if (!ports.captureStatus)
          return { ok: false, error: "capture_unavailable" };
        return { ok: true, data: await ports.captureStatus(req.id) };
      case "hello":
        return {
          ok: true,
          data: { app: "pond", version: ports.appVersion() },
        };
      case "library.info":
        return { ok: true, data: await ports.libraryInfo() };
      case "folders.list":
        if (!ports.foldersList)
          return { ok: false, error: "folders_unavailable" };
        return { ok: true, data: await ports.foldersList() };
      case "tags.list":
        if (!ports.tagsList) return { ok: false, error: "tags_unavailable" };
        return { ok: true, data: await ports.tagsList() };
      case "fish.list":
        if (!ports.fishList) return { ok: false, error: "fish_unavailable" };
        return { ok: true, data: await ports.fishList() };
      case "extension.settings":
        if (!ports.extensionSettings)
          return { ok: false, error: "settings_unavailable" };
        return { ok: true, data: await ports.extensionSettings() };
      case "session.pending":
        return { ok: true, data: ports.sessionPending() };
      case "enqueue": {
        const opts: EnqueueOpts = {};
        if (req.trigger) opts.trigger = req.trigger;
        if (req.cookies && req.cookies.length > 0) opts.cookies = req.cookies;
        return { ok: true, data: await ports.enqueue(req.url, opts) };
      }
      case "session.import": {
        const data = await ports.sessionImport(req.source, req.cookies);
        return { ok: true, data };
      }
      case "session.refresh": {
        if (!ports.sessionRefresh)
          return { ok: false, error: "session_refresh_unavailable" };
        const data = await ports.sessionRefresh(req.source, req.cookies);
        return { ok: true, data };
      }
      case "files.import": {
        if (!ports.importSharedFiles)
          return { ok: false, error: "files_unavailable" };
        try {
          return { ok: true, data: await ports.importSharedFiles(req.paths) };
        } catch (err) {
          if (err instanceof Error && err.message === "no_files")
            return { ok: false, error: "no_files" };
          throw err;
        }
      }
    }
  } catch (err) {
    if (err instanceof UnsupportedError) {
      return { ok: false, error: "unsupported_url" };
    }
    log.error("[pond native] dispatch failed", req.type, err);
    return { ok: false, error: "internal" };
  }
}
