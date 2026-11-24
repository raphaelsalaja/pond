import { z } from "zod";
import type { JsonValue } from "@/utils/json";
import type {
  FishTarget,
  Folder,
  LibraryTargets,
  Tag,
} from "@/utils/messaging";
import { nativeCall } from "@/utils/native";
import { resolveAppearance } from "@/utils/paint-theme";
import type { Appearance } from "@/utils/paint-theme";
import { OFFLINE, probe } from "@/utils/probe";
import type { ProbeResult } from "@/utils/probe";
import { readRecentTargets } from "@/utils/recent-targets";
import { getSettings } from "@/utils/settings";
import { themeVarsSchema } from "@/utils/theme";
import type { ThemeVars } from "@/utils/theme";
import { syncSettings } from "./settings";

const THEME_KEY = "libraryTheme";
const NAME_KEY = "libraryName";

/** Older Pond builds send folders without a parent or color, so both default to none. */
const foldersSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    parentId: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
    color: z
      .string()
      .nullish()
      .transform((value) => value ?? null),
  }),
);

const tagsSchema = z.array(
  z.object({
    name: z.string().min(1),
    starred: z.boolean().catch(false),
    usageCount: z.number().catch(0),
    lastUsedAt: z.number().nullable().catch(null),
  }),
);

const fishSchema = z.array(z.object({ id: z.string(), name: z.string() }));

export async function probeLibrary(): Promise<ProbeResult> {
  const result = await probe().catch((): ProbeResult => OFFLINE);
  if (result.state === "connected") {
    void syncSettings(true);
    await browser.storage.session
      .set({
        [THEME_KEY]: result.library.theme ?? null,
        [NAME_KEY]: result.library.name,
      })
      .catch(() => {});
  }
  return result;
}

/** Overlays reuse the last theme Pond shared so a toast doesn't cost a native round trip. */
async function libraryTheme(): Promise<ThemeVars | null> {
  const stored: Record<string, JsonValue> =
    await browser.storage.session.get(THEME_KEY);
  if (THEME_KEY in stored) {
    const cached = themeVarsSchema.nullable().safeParse(stored[THEME_KEY]);
    if (cached.success) {
      return cached.data;
    }
  }
  const result = await probeLibrary();
  return result.state === "connected" ? (result.library.theme ?? null) : null;
}

export async function overlayAppearance(): Promise<Appearance> {
  const [settings, theme] = await Promise.all([getSettings(), libraryTheme()]);
  return resolveAppearance(settings.theme, theme);
}

async function libraryName(): Promise<string> {
  const stored: Record<string, JsonValue> =
    await browser.storage.session.get(NAME_KEY);
  const cached = z.string().safeParse(stored[NAME_KEY]);
  if (cached.success) {
    return cached.data;
  }
  const result = await probeLibrary();
  return result.state === "connected" ? result.library.name : "Pond";
}

async function listFolders(): Promise<Array<Folder>> {
  const result = await nativeCall({ type: "folders.list" });
  if (!result.ok) {
    return [];
  }
  const folders = foldersSchema.safeParse(result.data);
  return folders.success ? folders.data : [];
}

async function listTags(): Promise<Array<Tag>> {
  const result = await nativeCall({ type: "tags.list" });
  if (!result.ok) {
    return [];
  }
  const tags = tagsSchema.safeParse(result.data);
  return tags.success ? tags.data : [];
}

/** Pond builds before Fish answer `invalid`, so the picker stays hidden. */
async function listFish(): Promise<Array<FishTarget>> {
  const result = await nativeCall({ type: "fish.list" });
  if (!result.ok) {
    return [];
  }
  const fish = fishSchema.safeParse(result.data);
  return fish.success ? fish.data : [];
}

export async function libraryTargets(): Promise<LibraryTargets> {
  const [name, folders, tags, fish, recent] = await Promise.all([
    libraryName(),
    listFolders(),
    listTags(),
    listFish(),
    readRecentTargets(),
  ]);
  const known = new Set(folders.map((folder) => folder.id));
  return {
    name,
    folders,
    tags,
    fish,
    recentFolderIds: recent.folderIds.filter((id) => known.has(id)),
    recentTags: recent.tags,
  };
}
