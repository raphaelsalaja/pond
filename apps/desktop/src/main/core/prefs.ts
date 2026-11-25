import type { DeepPartial } from "@pond/schema/db";
import {
  DEFAULT_IMAGE_DOWNLOAD,
  DEFAULT_PREFS,
  DEFAULT_VIDEO_DOWNLOAD,
  settings as settingsTable,
} from "@pond/schema/db";
import type {
  ImageDownloadSettings,
  Prefs,
  Source,
  SourceOverrides,
  VideoDownloadSettings,
} from "@pond/schema/db";
import type { ExternalSource } from "@pond/schema/sources";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getGlobalDb } from "../db";
import { createMemoCache } from "../lib/memo-cache";
import {
  imageSourceOverrides,
  normalizeImage,
  normalizeVideo,
  resolveImage,
  resolveVideo,
  videoSourceOverrides,
} from "./download-prefs";
import { prepareGlobalShortcuts } from "./global-shortcuts";
import {
  currentLibraryId,
  isUnboundLibraryId,
  mergeAppSlice,
  mergePondSlice,
  mergePrefs,
  normalizeStoredPrefs,
  readBundlePondPrefs,
  splitPrefsPatch,
  withoutFolderPrefs,
  writeBundlePondPrefs,
} from "./prefs-scope";
import type { PondPrefs, StoredPrefs, StoredPrefsInput } from "./prefs-scope";

interface SettingsCache {
  libraryId: string;
  prefs: Prefs;
  videoDownload: VideoDownloadSettings;
  imageDownload: ImageDownloadSettings;
  videoSources: SourceOverrides<VideoDownloadSettings>;
  imageSources: SourceOverrides<ImageDownloadSettings>;
}

const settingsCache = createMemoCache<SettingsCache>(fetchSettings);
const prefsListeners = new Set<(prefs: Prefs) => void>();

export function subscribePrefs(listener: (prefs: Prefs) => void): () => void {
  prefsListeners.add(listener);
  return () => {
    prefsListeners.delete(listener);
  };
}

export function invalidatePrefs(): void {
  settingsCache.invalidate();
}

async function fetchSettings(): Promise<SettingsCache> {
  const libraryId = currentLibraryId();
  const db = await getGlobalDb();
  const rows = await db
    .select({
      prefs: settingsTable.prefs,
      videoDownload: settingsTable.videoDownload,
      imageDownload: settingsTable.imageDownload,
    })
    .from(settingsTable)
    .where(eq(settingsTable.id, "singleton"));
  const row = rows[0];
  const stored = normalizeStoredPrefs(row?.prefs);
  if (!isSameStored(row?.prefs, stored)) {
    await persistStoredPrefs(stored);
  }
  const pond = await resolvePondSlice(stored, libraryId);
  return {
    libraryId,
    prefs: mergePrefs(stored.app, pond),
    videoDownload: normalizeVideo(row?.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD),
    imageDownload: normalizeImage(row?.imageDownload ?? DEFAULT_IMAGE_DOWNLOAD),
    videoSources: videoSourceOverrides(row?.videoDownload),
    imageSources: imageSourceOverrides(row?.imageDownload),
  };
}

async function resolvePondSlice(
  stored: StoredPrefs,
  libraryId: string,
): Promise<DeepPartial<PondPrefs>> {
  if (isUnboundLibraryId(libraryId)) return stored.pending ?? {};

  let bundle: DeepPartial<PondPrefs> | null;
  try {
    bundle = readBundlePondPrefs();
  } catch (error) {
    log.debug("[pond prefs] Library preferences unavailable", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return stored.pending ?? {};
  }
  if (bundle) return bundle;

  const seed = mergePondSlice(stored.pending ?? {});
  try {
    writeBundlePondPrefs(seed);
  } catch (error) {
    log.warn("[pond prefs] seeding bundle settings.json failed", error);
    return seed;
  }
  if (stored.pending) {
    try {
      await persistStoredPrefs({ ...stored, pending: null });
    } catch (error) {
      log.warn("[pond prefs] clearing pending library prefs failed", error);
    }
  }
  return seed;
}

async function loadSettings(): Promise<SettingsCache> {
  try {
    const cached = settingsCache.peek();
    const libraryId = currentLibraryId();
    if (cached && cached.libraryId === libraryId) return cached;
    settingsCache.invalidate();
    return await settingsCache.get();
  } catch (error) {
    log.warn("[pond prefs] failed to read settings, using defaults", error);
    return {
      libraryId: currentLibraryId(),
      prefs: DEFAULT_PREFS,
      videoDownload: DEFAULT_VIDEO_DOWNLOAD,
      imageDownload: DEFAULT_IMAGE_DOWNLOAD,
      videoSources: {},
      imageSources: {},
    };
  }
}

function isSameStored(raw: StoredPrefsInput, stored: StoredPrefs): boolean {
  try {
    return JSON.stringify(raw) === JSON.stringify(stored);
  } catch {
    return false;
  }
}

async function persistStoredPrefs(stored: StoredPrefs): Promise<void> {
  const db = await getGlobalDb();
  db.insert(settingsTable)
    .values({
      id: "singleton",
      prefs: stored,
    })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { prefs: stored, updatedAt: new Date() },
    })
    .run();
}

export async function getPrefs(): Promise<Prefs> {
  return (await loadSettings()).prefs;
}

export async function getVideoDownloadPrefs(
  source?: Source | null,
): Promise<VideoDownloadSettings> {
  const s = await loadSettings();
  return resolveVideo(s.videoDownload, s.videoSources, source);
}

export async function getImageDownloadPrefs(
  source?: Source | null,
): Promise<ImageDownloadSettings> {
  const s = await loadSettings();
  return resolveImage(s.imageDownload, s.imageSources, source);
}

type DownloadConfig = Pick<
  SettingsCache,
  "videoDownload" | "imageDownload" | "videoSources" | "imageSources"
>;

export async function getDownloadConfig(): Promise<DownloadConfig> {
  const { videoDownload, imageDownload, videoSources, imageSources } =
    await loadSettings();
  return { videoDownload, imageDownload, videoSources, imageSources };
}

let prefsQueue = Promise.resolve();

type PondPrune = (slice: DeepPartial<PondPrefs>) => DeepPartial<PondPrefs>;

function enqueuePrefs(operation: () => Promise<Prefs>): Promise<Prefs> {
  const result = prefsQueue.then(operation);
  prefsQueue = result.then(
    () => {},
    () => {},
  );
  return result;
}

export function setPrefs(patch: DeepPartial<Prefs>): Promise<Prefs> {
  return enqueuePrefs(() => applyPrefs(patch));
}

export function removeFolderPrefs(ids: ReadonlyArray<string>): Promise<Prefs> {
  return enqueuePrefs(() =>
    applyPrefs({}, (slice) => withoutFolderPrefs(slice, ids)),
  );
}

async function applyPrefs(
  patch: DeepPartial<Prefs>,
  prune?: PondPrune,
): Promise<Prefs> {
  const libraryId = currentLibraryId();
  const current = await loadSettings();
  const { app, pond } = splitPrefsPatch(patch);
  const writesPond = Object.keys(pond).length > 0 || prune !== undefined;

  let stored = normalizeStoredPrefs(await readRawStoredPrefs());

  let pondSlice: PondPrefs;
  if (isUnboundLibraryId(libraryId)) {
    if (writesPond) {
      const pending = stored.pending ?? {};
      stored = {
        ...stored,
        pending: mergePondSlice(prune ? prune(pending) : pending, pond),
      };
    }
    pondSlice = mergePondSlice(stored.pending ?? {});
  } else {
    const base = readBundlePondPrefs() ?? mergePondSlice({});
    pondSlice = mergePondSlice(prune ? prune(base) : base, pond);
  }

  if (Object.keys(app).length > 0) {
    stored = { ...stored, app: mergeAppSlice(stored.app, app) };
  }
  const merged = mergePrefs(stored.app, pondSlice);
  const shortcutChange = patch.shortcuts
    ? prepareGlobalShortcuts(merged.shortcuts.overrides)
    : null;
  try {
    if (!isUnboundLibraryId(libraryId) && writesPond) {
      writeBundlePondPrefs(pondSlice);
    }
    await persistStoredPrefs(stored);
    shortcutChange?.commit();
  } catch (error) {
    shortcutChange?.rollback();
    throw error;
  }
  settingsCache.set({
    libraryId,
    prefs: merged,
    videoDownload: current.videoDownload,
    imageDownload: current.imageDownload,
    videoSources: current.videoSources,
    imageSources: current.imageSources,
  });
  for (const listener of prefsListeners) {
    try {
      listener(merged);
    } catch (error) {
      log.warn("[pond prefs] listener failed", error);
    }
  }
  return merged;
}

async function readRawStoredPrefs(): Promise<StoredPrefsInput> {
  const db = await getGlobalDb();
  const rows = await db
    .select({ prefs: settingsTable.prefs })
    .from(settingsTable)
    .where(eq(settingsTable.id, "singleton"));
  return rows[0]?.prefs;
}

async function writeDownloads(next: DownloadConfig): Promise<void> {
  const videoDownload = { ...next.videoDownload, sources: next.videoSources };
  const imageDownload = { ...next.imageDownload, sources: next.imageSources };
  const db = await getGlobalDb();
  db.insert(settingsTable)
    .values({ id: "singleton", videoDownload, imageDownload })
    .onConflictDoUpdate({
      target: settingsTable.id,
      set: { videoDownload, imageDownload, updatedAt: new Date() },
    })
    .run();
  const cached = settingsCache.peek();
  if (cached) {
    settingsCache.set({
      ...cached,
      videoDownload: next.videoDownload,
      imageDownload: next.imageDownload,
      videoSources: videoSourceOverrides(videoDownload),
      imageSources: imageSourceOverrides(imageDownload),
    });
  }
}

export async function setVideoDownloadPrefs(
  patch: Partial<VideoDownloadSettings>,
  source?: ExternalSource,
): Promise<void> {
  const current = await loadSettings();
  if (source) {
    const videoSources = {
      ...current.videoSources,
      [source]: { ...current.videoSources[source], ...patch },
    };
    await writeDownloads({ ...current, videoSources });
    return;
  }
  const videoDownload = normalizeVideo({ ...current.videoDownload, ...patch });
  await writeDownloads({ ...current, videoDownload });
}

export async function setImageDownloadPrefs(
  patch: Partial<ImageDownloadSettings>,
  source?: ExternalSource,
): Promise<void> {
  const current = await loadSettings();
  if (source) {
    const imageSources = {
      ...current.imageSources,
      [source]: { ...current.imageSources[source], ...patch },
    };
    await writeDownloads({ ...current, imageSources });
    return;
  }
  const imageDownload = normalizeImage({ ...current.imageDownload, ...patch });
  await writeDownloads({ ...current, imageDownload });
}

export async function setSourceDownloadsCustom(
  source: ExternalSource,
  custom: boolean,
): Promise<void> {
  const current = await loadSettings();
  const videoSources = { ...current.videoSources };
  const imageSources = { ...current.imageSources };
  if (custom) {
    videoSources[source] ??= {};
    imageSources[source] ??= {};
  } else {
    delete videoSources[source];
    delete imageSources[source];
  }
  await writeDownloads({ ...current, videoSources, imageSources });
}
