import { z } from "zod";

export const FOLDER_ICON_IDS = [
  "folder",
  "bookmark",
  "album",
  "tag",
  "download",
  "code",
  "star",
  "heart",
  "sparkle",
  "image",
  "camera",
  "video",
  "music",
  "book",
  "note",
  "palette",
  "brush",
  "typography",
  "layers",
  "cube",
  "globe",
  "pin",
  "plane",
  "house",
  "inbox",
  "lightbulb",
  "flag",
  "trophy",
  "rocket",
  "gamepad",
  "leaf",
  "shopping",
  "briefcase",
  "office",
  "calendar",
  "checklist",
  "clipboard",
  "mail",
  "chat",
  "bell",
  "mind-map",
  "stopwatch",
  "person",
  "pencil",
  "paperclip",
  "wallet",
  "credit-card",
  "coins",
  "receipt",
  "chart",
  "cart",
  "gift",
  "diamond",
  "computer",
  "phone",
  "terminal",
  "bug",
  "chip",
  "server",
  "database",
  "settings",
  "tools",
  "lock",
  "shield",
  "key",
  "link",
  "map",
  "compass",
  "car",
  "suitcase",
  "mountain",
  "sun",
  "moon",
  "graduation-cap",
  "flask",
  "atom",
  "calculator",
  "research",
  "coffee",
  "food",
  "dumbbell",
  "paw",
  "headphones",
  "microphone",
  "movie",
  "tv",
  "ticket",
  "dice",
  "smile",
  "flame",
  "archive",
  "package",
  "shapes",
  "document",
  "magic",
] as const;

export const FolderIconIdSchema = z.enum(FOLDER_ICON_IDS);

export const FOLDER_COLOR_IDS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;

/** A folder color is a palette ID or a six-digit hex, stored lowercase. */
export const FolderColorSchema = z.union([
  z.enum(FOLDER_COLOR_IDS),
  z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .transform((hex) => hex.toLowerCase()),
]);

export const RECENT_FOLDER_APPEARANCE_LIMIT = 8;

/** Icons and colors picked most recently first, shared by every Library on this computer. */
export const FolderAppearancePrefsSchema = z.object({
  recentIcons: z
    .array(FolderIconIdSchema)
    .max(RECENT_FOLDER_APPEARANCE_LIMIT)
    .catch([]),
  recentColors: z
    .array(FolderColorSchema)
    .max(RECENT_FOLDER_APPEARANCE_LIMIT)
    .catch([]),
});

export const FolderPresentationSchema = z.object({
  icon: FolderIconIdSchema.optional(),
  layout: z.enum(["waterfall", "grid", "justified", "list"]).catch("waterfall"),
  sortKey: z.string().catch("savedAt"),
  sortDir: z.enum(["asc", "desc"]).catch("desc"),
  zoom: z.number().finite().catch(130),
  includeSubfolders: z.boolean().catch(true),
  randomSeed: z.string().catch("pond"),
  manualOrder: z.array(z.string()).catch([]),
  pinnedIds: z.array(z.string()).catch([]),
  coverSaveId: z.string().nullable().catch(null),
  quickAccess: z.boolean().optional(),
  quickAccessOrder: z.number().int().nonnegative().optional(),
});
