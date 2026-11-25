import {
  IconAlbum2,
  IconChatBubble,
  IconClipboardArrowIn,
  IconCoffee,
  IconCompass,
  IconDownload,
  IconEye,
  IconFile,
  IconFolder,
  IconFolderBan,
  IconFolderOpen,
  IconLayers,
  IconNodes3,
  IconNut,
  IconTag,
  IconTagSlash,
  IconTrashXmark,
  IconWindow,
  IconWindowDownload,
} from "@pond/icons";
import type { ComponentType } from "react";

export const media = (id: string) => `/media/${id}.jpg`;

export interface Shot {
  id: string;
  title: string;
  source: string;
  aspect: number;
}

/** The two chairs the search finds. */
export const WICKER: Shot = {
  id: "01KXAYVKHQ8R54NXFAKFD793TA",
  title: "Wicker chair",
  source: "Are.na",
  aspect: 480 / 640,
};

const LOUNGE: Shot = {
  id: "01M1Z5DRYKKHRGE6G1HJY7NTTH",
  title: "Leather lounge chair",
  source: "Cosmos",
  aspect: 1,
};

/** The Recent group on an empty query, newest first. */
export const RECENT: Array<Shot> = [
  {
    id: "01KXPDEGV9YA8Q39G77V3HS3AA",
    title: "Kiladalen cabin",
    source: "Cosmos",
    aspect: 480 / 318,
  },
  {
    id: "01M1Z5EJM0DK2SN3NBPY1SKNYD",
    title: "Lemaire AW25, look 28",
    source: "Are.na",
    aspect: 1066 / 1600,
  },
  {
    id: "01M1Z7ARJ82B6CY1J9QHHXH33R",
    title: "911 GT3",
    source: "Pinterest",
    aspect: 1280 / 1600,
  },
  {
    id: "01KXA1D4FYF5GS2YFZT17AAQR3",
    title: "Ikebana",
    source: "Are.na",
    aspect: 480 / 655,
  },
  {
    id: "01M1Z7ARH5ZSSS2T9HF1QE5FP4",
    title: "Light study",
    source: "Are.na",
    aspect: 1165 / 1600,
  },
];

/** The library grid behind the menu, in the order the waterfall places it. */
export const GRID: Array<Shot> = [
  WICKER,
  {
    id: "01M1Z5EJM0DK2SN3NBPY1SKNYD",
    title: "Lemaire AW25, look 28",
    source: "Are.na",
    aspect: 1066 / 1600,
  },
  LOUNGE,
  {
    id: "01KXP2R8T53GXNDE6MF689MAE4",
    title: "Zweifel studio",
    source: "Cosmos",
    aspect: 480 / 320,
  },
  {
    id: "01M1Z5EJM4EJSHHMAQGT0583JE",
    title: "Auralee FW26, look 22",
    source: "Are.na",
    aspect: 1066 / 1600,
  },
  {
    id: "01KXPDEGV9YA8Q39G77V3HS3AA",
    title: "Kiladalen cabin",
    source: "Cosmos",
    aspect: 480 / 318,
  },
  {
    id: "01M1Z7ARJ82B6CY1J9QHHXH33R",
    title: "911 GT3",
    source: "Pinterest",
    aspect: 1280 / 1600,
  },
  {
    id: "01M1Z7ARH6SPW2625B2BVKB13D",
    title: "Grey suit",
    source: "Cosmos",
    aspect: 1600 / 1593,
  },
  {
    id: "01KTK26F2WYAW8DMSMD0KAXNKW",
    title: "Still life, camera",
    source: "Are.na",
    aspect: 480 / 600,
  },
  {
    id: "01M1Z7ARH5ZSSS2T9HF1QE5FP4",
    title: "Light study",
    source: "Are.na",
    aspect: 1165 / 1600,
  },
  {
    id: "01KXAYBQZS585AQJPP3ZGZAD22",
    title: "Natural Selection",
    source: "Are.na",
    aspect: 1,
  },
  {
    id: "01KXA1D4FYF5GS2YFZT17AAQR3",
    title: "Ikebana",
    source: "Are.na",
    aspect: 480 / 655,
  },
  {
    id: "01KXP2TKF2ZN07QE8NDD0S5V5B",
    title: "Studio storage",
    source: "Cosmos",
    aspect: 480 / 720,
  },
  {
    id: "01M1Z5DRYJFGZ37JBZGDQ2HYE5",
    title: "Silver 911",
    source: "Pinterest",
    aspect: 1365 / 1600,
  },
  {
    id: "01M1Z5EJK6338MH34BE28RPEV9",
    title: "Desk at night",
    source: "Are.na",
    aspect: 1200 / 1600,
  },
  {
    id: "01KTK26F2XJJNW26QWYQJDWR2D",
    title: "Travel bag",
    source: "Are.na",
    aspect: 480 / 640,
  },
];

/** Every save the keyword lookup can return, deduplicated by id. */
export const SAVES: Array<Shot> = [
  ...new Map(
    [...RECENT, WICKER, LOUNGE, ...GRID].map((shot) => [shot.id, shot]),
  ).values(),
];

export interface Folder {
  name: string;
  count: number;
}

export const FOLDERS: Array<Folder> = [
  { name: "Chairs", count: 23 },
  { name: "Interiors", count: 58 },
  { name: "Cars", count: 12 },
  { name: "Cabins", count: 9 },
  { name: "Lighting", count: 17 },
  { name: "Studio", count: 31 },
];

export const VIEWS = ["Warm Palette", "Five Stars"];

export const LIBRARY_TOTAL = 2480;
export const TAG_TOTAL = 64;

export interface Command {
  group: "Create" | "Import" | "Navigate" | "App";
  label: string;
  detail?: string;
  keywords: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
  shortcut?: Array<Array<string>>;
}

/** `command-menu/commands.ts`, with each shortcut as the menu draws it. */
export const COMMANDS: Array<Command> = [
  {
    group: "Create",
    label: "New Folder",
    icon: IconFolder,
    keywords: "create collection organize directory",
    shortcut: [["⌘", "⇧", "N"]],
  },
  {
    group: "Create",
    label: "New Tag",
    icon: IconTag,
    keywords: "create label organize",
    shortcut: [["⌘", "T"]],
  },
  {
    group: "Create",
    label: "New Tag Group",
    icon: IconWindow,
    keywords: "create labels organize",
    shortcut: [["⌘", "⌥", "T"]],
  },
  {
    group: "Create",
    label: "New Source",
    icon: IconNodes3,
    keywords: "connect watch folder add account",
    shortcut: [["⌘", "N"]],
  },
  {
    group: "Create",
    label: "New Watch",
    icon: IconEye,
    keywords: "source public account follow import watch",
  },
  {
    group: "Create",
    label: "New Watched Folder",
    icon: IconFolderOpen,
    keywords: "auto import directory files copy local",
  },
  {
    group: "Import",
    label: "Import Files",
    icon: IconFile,
    keywords: "image video audio pdf document media",
    shortcut: [["⌘", "O"]],
  },
  {
    group: "Import",
    label: "Import Folders",
    icon: IconFolderOpen,
    keywords: "directory files media",
    shortcut: [["⌘", "⇧", "O"]],
  },
  {
    group: "Import",
    label: "Import from Clipboard",
    icon: IconClipboardArrowIn,
    keywords: "paste image files",
  },
  {
    group: "Import",
    label: "Import Eagle Library",
    icon: IconDownload,
    keywords: "migrate archive package",
  },
  {
    group: "Navigate",
    label: "Library",
    detail: "All saves",
    icon: IconAlbum2,
    keywords: "home saves archive",
    shortcut: [["G"], ["L"]],
  },
  {
    group: "Navigate",
    label: "Uncategorized",
    detail: "Saves that aren't in a folder",
    icon: IconFolderBan,
    keywords: "unfiled inbox no folder",
  },
  {
    group: "Navigate",
    label: "Untagged",
    detail: "Saves without tags",
    icon: IconTagSlash,
    keywords: "no tags labels",
  },
  {
    group: "Navigate",
    label: "Sources",
    detail: "Connected accounts and watches",
    icon: IconNodes3,
    keywords: "accounts connect watches",
    shortcut: [["G"], ["S"]],
  },
  {
    group: "Navigate",
    label: "Downloads",
    detail: "Active and recent transfers",
    icon: IconWindowDownload,
    keywords: "transfers queue",
    shortcut: [["G"], ["D"]],
  },
  {
    group: "Navigate",
    label: "Tags",
    detail: "Organize your library",
    icon: IconTag,
    keywords: "labels organize",
  },
  {
    group: "Navigate",
    label: "Assistant",
    detail: "Ask your library",
    icon: IconChatBubble,
    keywords: "ask chat ai",
  },
  {
    group: "Navigate",
    label: "Trash",
    detail: "Recently deleted saves",
    icon: IconTrashXmark,
    keywords: "deleted bin",
    shortcut: [["G"], ["T"]],
  },
  {
    group: "App",
    label: "Open Settings",
    detail: "Preferences, storage, and AI",
    icon: IconNut,
    keywords: "preferences configuration",
    shortcut: [["⌘", ","]],
  },
  {
    group: "App",
    label: "Run Setup Again",
    detail: "Review how Pond is set up",
    icon: IconCompass,
    keywords: "onboarding welcome guide tour setup",
  },
  {
    group: "App",
    label: "Support Pond",
    detail: "Buy Me a Coffee or star on GitHub",
    icon: IconCoffee,
    keywords: "donate tip sponsor coffee github star",
  },
];

export const APPLY_VIEW: Command = {
  group: "Navigate",
  label: "Apply Saved View",
  keywords: "smart folder filter",
  icon: IconLayers,
};

export const MEDIA = SAVES.map((shot) => media(shot.id));
