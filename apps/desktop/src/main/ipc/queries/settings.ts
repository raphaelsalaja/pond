import { copyFile, mkdir, readdir, unlink } from "node:fs/promises";
import { extname, resolve as resolvePath } from "node:path";
import {
  DEFAULT_AI_AUTONOMY,
  DEFAULT_VIDEO_DOWNLOAD,
  settings as settingsTable,
  type VideoDownloadSettings,
} from "@pond/schema/db";
import { eq } from "drizzle-orm";
import { BrowserWindow, dialog } from "electron";
import { getPrefs, setPrefs, setVideoDownloadPrefs } from "../../core/prefs";
import { getDb } from "../../db";
import {
  getAiGatewayKey,
  getIngestToken,
  rotateIngestToken,
  setAiGatewayKey,
} from "../../keychain";
import { libraryRoot as libraryRootDir } from "../../paths";
import type { QueryHandlerMap } from "../helpers";

export const settingsQueries: QueryHandlerMap = {
  async "settings.get"() {
    const db = await getDb();
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.id, "singleton"));
    if (rows[0]) {
      return {
        ...rows[0],
        videoDownload: rows[0].videoDownload ?? DEFAULT_VIDEO_DOWNLOAD,
      };
    }
    await db
      .insert(settingsTable)
      .values({
        id: "singleton",
        aiAutonomy: DEFAULT_AI_AUTONOMY,
        videoDownload: DEFAULT_VIDEO_DOWNLOAD,
      })
      .onConflictDoNothing()
      .run();
    return {
      id: "singleton",
      aiAutonomy: DEFAULT_AI_AUTONOMY,
      videoDownload: DEFAULT_VIDEO_DOWNLOAD,
      libraryRoot: null,
      updatedAt: new Date(),
    };
  },

  async "settings.setVideoDownload"(params) {
    const next = await setVideoDownloadPrefs(
      params as Partial<VideoDownloadSettings>,
    );
    return { ok: true, videoDownload: next };
  },

  async "settings.ingestToken"() {
    return { token: await getIngestToken() };
  },

  async "settings.onboarded"() {
    const db = await getDb();
    const rows = await db
      .select({ onboarded: settingsTable.onboarded })
      .from(settingsTable)
      .where(eq(settingsTable.id, "singleton"));
    return Boolean(rows[0]?.onboarded);
  },

  async "settings.markOnboarded"(params) {
    const db = await getDb();
    await db
      .insert(settingsTable)
      .values({
        id: "singleton",
        aiAutonomy: DEFAULT_AI_AUTONOMY,
        onboarded: Boolean(params.value ?? true),
      })
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: { onboarded: Boolean(params.value ?? true) },
      })
      .run();
    return { ok: true };
  },

  async "settings.rotateIngestToken"() {
    return { token: await rotateIngestToken() };
  },

  async "settings.aiGatewayKey"() {
    return { key: await getAiGatewayKey() };
  },

  async "settings.getPrefs"() {
    return await getPrefs();
  },

  async "settings.setPrefs"(params) {
    const next = await setPrefs(params as Parameters<typeof setPrefs>[0]);
    return { ok: true, prefs: next };
  },

  async "settings.setAiGatewayKey"(params) {
    await setAiGatewayKey(String(params.key ?? ""));
    return { ok: true };
  },

  async "settings.setAiAutonomy"(params) {
    const db = await getDb();
    const next = String(params.tagging ?? "suggest") as
      | "off"
      | "suggest"
      | "auto-apply"
      | "auto";
    const guidance = String(params.additionalGuidance ?? "");
    const allowed = new Set(["off", "suggest", "auto-apply", "auto"]);
    if (!allowed.has(next)) {
      return { ok: false, reason: "invalid_level" };
    }
    const current = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.id, "singleton"));
    const merged: typeof DEFAULT_AI_AUTONOMY = {
      ...(current[0]?.aiAutonomy ?? DEFAULT_AI_AUTONOMY),
      tagging: next,
      additionalGuidance: guidance,
    };
    await db
      .insert(settingsTable)
      .values({
        id: "singleton",
        aiAutonomy: merged,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: settingsTable.id,
        set: {
          aiAutonomy: merged,
          updatedAt: new Date(),
        },
      })
      .run();
    return { ok: true, aiAutonomy: merged };
  },

  async "settings.setAiProvider"(params) {
    const { setAiProviderConfig } = await import("../../core/prefs");
    const next = await setAiProviderConfig(
      params as Partial<import("@pond/schema/db").AiProviderConfig>,
    );
    return { ok: true, aiProvider: next };
  },

  async "settings.detectOllama"(params) {
    const { detectOllama } = await import("../../core/enrich/provider");
    return await detectOllama(String(params.baseUrl ?? ""));
  },

  async "settings.recreateVec"() {
    const { recreateVecTable } = await import("../../db");
    await recreateVecTable();
    return { ok: true };
  },

  async "profile.pickAvatar"() {
    const win = BrowserWindow.getFocusedWindow() ?? undefined;
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: "Pick avatar",
          properties: ["openFile"],
          filters: [
            {
              name: "Images",
              extensions: ["png", "jpg", "jpeg", "gif", "webp"],
            },
          ],
        })
      : await dialog.showOpenDialog({
          title: "Pick avatar",
          properties: ["openFile"],
          filters: [
            {
              name: "Images",
              extensions: ["png", "jpg", "jpeg", "gif", "webp"],
            },
          ],
        });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const, reason: "cancelled" as const };
    }
    const src = result.filePaths[0];
    if (!src) return { ok: false as const, reason: "cancelled" as const };
    const meta = resolvePath(libraryRootDir(), "_meta");
    await mkdir(meta, { recursive: true });
    const ext = extname(src).toLowerCase() || ".png";
    // Reuse the filename means renderer img caches by URL — pick a
    // fresh name on every upload so the URL changes too.
    const dest = resolvePath(meta, `avatar-${Date.now()}${ext}`);
    await copyFile(src, dest);
    await pruneStaleAvatars(meta, dest);
    await setPrefs({ profile: { avatarPath: dest } });
    return { ok: true as const, path: dest };
  },

  async "profile.clearAvatar"() {
    await setPrefs({ profile: { avatarPath: null } });
    return { ok: true as const };
  },

  async "ai.gatewayKey"() {
    return { key: await getAiGatewayKey() };
  },
};

async function pruneStaleAvatars(dir: string, keep: string) {
  const entries = await readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => /^avatar[-.]/.test(name))
      .map((name) => resolvePath(dir, name))
      .filter((path) => path !== keep)
      .map((path) => unlink(path).catch(() => undefined)),
  );
}
