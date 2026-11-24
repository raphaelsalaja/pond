import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { app } from "electron";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getGlobalDb } from "../db";
import { invalidatePaths } from "../paths";
import {
  getDownloadConfig,
  getVideoDownloadPrefs,
  invalidatePrefs,
  setSourceDownloadsCustom,
  setVideoDownloadPrefs,
} from "./prefs";

function nativeSqliteAvailable(): boolean {
  try {
    const probe = new Database(":memory:");
    probe.close();
    return true;
  } catch (error) {
    if (process.versions.electron) {
      throw error;
    }
    return false;
  }
}

describe.skipIf(!nativeSqliteAvailable())("per-source download prefs", () => {
  let dir = "";

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "pond-prefs-"));
    vi.spyOn(app, "getPath").mockReturnValue(dir);
    invalidatePaths();
  });

  afterEach(async () => {
    (await getGlobalDb()).$raw.exec("DELETE FROM settings");
    invalidatePrefs();
  });

  afterAll(async () => {
    (await getGlobalDb()).$raw.close();
    vi.restoreAllMocks();
    invalidatePaths();
    rmSync(dir, { recursive: true, force: true });
  });

  it("stores a source override without touching other sources", async () => {
    const global = await getVideoDownloadPrefs();
    await setVideoDownloadPrefs({ maxHeight: 720 }, "youtube");

    expect((await getVideoDownloadPrefs("youtube")).maxHeight).toBe(720);
    expect((await getVideoDownloadPrefs("twitter")).maxHeight).toBe(
      global.maxHeight,
    );

    invalidatePrefs();
    expect((await getVideoDownloadPrefs("youtube")).maxHeight).toBe(720);
  });

  it("keeps source overrides when the global settings change", async () => {
    await setVideoDownloadPrefs({ maxHeight: 720 }, "youtube");
    await setVideoDownloadPrefs({ autoDownload: true });

    invalidatePrefs();
    const youtube = await getVideoDownloadPrefs("youtube");
    expect(youtube.maxHeight).toBe(720);
    expect(youtube.autoDownload).toBe(true);
    expect((await getVideoDownloadPrefs("twitter")).autoDownload).toBe(true);
  });

  it("drops the override when the source stops being custom", async () => {
    await setVideoDownloadPrefs({ maxHeight: 720 }, "youtube");
    await setSourceDownloadsCustom("youtube", false);

    invalidatePrefs();
    const config = await getDownloadConfig();
    expect(config.videoSources.youtube).toBeUndefined();
    expect(config.imageSources.youtube).toBeUndefined();
    expect((await getVideoDownloadPrefs("youtube")).maxHeight).toBe(
      config.videoDownload.maxHeight,
    );
  });

  it("marks a source custom with empty overrides", async () => {
    await setSourceDownloadsCustom("youtube", true);

    invalidatePrefs();
    const config = await getDownloadConfig();
    expect(config.videoSources.youtube).toEqual({});
    expect(config.imageSources.youtube).toEqual({});
  });
});
