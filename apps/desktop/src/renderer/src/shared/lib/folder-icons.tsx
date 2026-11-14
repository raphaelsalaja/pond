import {
  IconAlbum2,
  IconArchive,
  IconAtom,
  IconBagShopping,
  IconBell,
  IconBook,
  IconBookmark,
  IconBriefcase,
  IconBug,
  IconBuilding,
  IconCalculator,
  IconCalendar,
  IconCamera,
  IconCar,
  IconCart,
  IconChartBar,
  IconChatBubble,
  IconCheckList,
  IconChip,
  IconClipboard,
  IconCode2,
  IconCoffee,
  IconCoins,
  IconCompass,
  IconComputer,
  IconCreditCard,
  IconCube,
  IconCylinder,
  IconDiamond,
  IconDice,
  IconDownload,
  IconDumbbell,
  IconEnvelope,
  IconFaceSmile,
  IconFigures,
  IconFile,
  IconFlag,
  IconFlame,
  IconFlask,
  IconFolder,
  IconForkKnife,
  IconGamepad,
  IconGear3,
  IconGift,
  IconGlobe,
  IconGraduationCap,
  IconHashtag,
  IconHeadphones,
  IconHeart,
  IconHouse,
  IconImage,
  IconInbox,
  IconKey,
  IconLayers,
  IconLeaf,
  IconLightbulb,
  IconLink2,
  IconLocation,
  IconLock,
  IconMagicWand,
  IconMagnifier,
  IconMap,
  IconMicrophone,
  IconMindMap,
  IconMoon,
  IconMountain,
  IconMovie,
  IconMusicNote,
  IconNote,
  IconPackage,
  IconPaintbrush,
  IconPalette,
  IconPaperclip,
  IconPaw,
  IconPencil,
  IconPhone,
  IconPlane,
  IconReceipt,
  IconRocket,
  IconServer,
  IconSettingsWrench,
  IconShieldCheck,
  IconSparkle,
  IconStar,
  IconStopwatch,
  IconSuitcase,
  IconSun,
  IconTerminal,
  IconTicket,
  IconTrophy,
  IconTv,
  IconTypography,
  IconUser,
  IconVideo,
  IconWallet,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import type { FOLDER_ICON_IDS } from "@pond/schema/folder-presentation";

export type FolderIconId = (typeof FOLDER_ICON_IDS)[number];

export interface FolderIconOption {
  id: FolderIconId;
  label: string;
  Icon: IconComponent;
  keywords: string;
}

export const FOLDER_ICONS: readonly FolderIconOption[] = [
  {
    id: "folder",
    label: "Folder",
    Icon: IconFolder,
    keywords: "directory files default",
  },
  {
    id: "bookmark",
    label: "Bookmark",
    Icon: IconBookmark,
    keywords: "saved favorite reading later",
  },
  {
    id: "album",
    label: "Album",
    Icon: IconAlbum2,
    keywords: "photos collection gallery",
  },
  {
    id: "tag",
    label: "Tag",
    Icon: IconHashtag,
    keywords: "hashtag label topic",
  },
  {
    id: "download",
    label: "Download",
    Icon: IconDownload,
    keywords: "downloads saved arrow",
  },
  {
    id: "code",
    label: "Code",
    Icon: IconCode2,
    keywords: "developer programming brackets",
  },
  {
    id: "star",
    label: "Star",
    Icon: IconStar,
    keywords: "favorite starred important",
  },
  {
    id: "heart",
    label: "Heart",
    Icon: IconHeart,
    keywords: "love like favorite",
  },
  {
    id: "sparkle",
    label: "Sparkle",
    Icon: IconSparkle,
    keywords: "magic new shine ai",
  },
  {
    id: "image",
    label: "Image",
    Icon: IconImage,
    keywords: "photo picture gallery",
  },
  {
    id: "camera",
    label: "Camera",
    Icon: IconCamera,
    keywords: "photo photography shoot",
  },
  {
    id: "video",
    label: "Video",
    Icon: IconVideo,
    keywords: "film clip recording",
  },
  {
    id: "music",
    label: "Music",
    Icon: IconMusicNote,
    keywords: "song audio sound",
  },
  {
    id: "book",
    label: "Book",
    Icon: IconBook,
    keywords: "reading library novel",
  },
  {
    id: "note",
    label: "Note",
    Icon: IconNote,
    keywords: "notes writing memo",
  },
  {
    id: "palette",
    label: "Palette",
    Icon: IconPalette,
    keywords: "color art design paint",
  },
  {
    id: "brush",
    label: "Brush",
    Icon: IconPaintbrush,
    keywords: "paint art drawing illustration",
  },
  {
    id: "typography",
    label: "Typography",
    Icon: IconTypography,
    keywords: "font type text lettering",
  },
  {
    id: "layers",
    label: "Layers",
    Icon: IconLayers,
    keywords: "stack design layout",
  },
  {
    id: "cube",
    label: "Cube",
    Icon: IconCube,
    keywords: "3d box model object",
  },
  {
    id: "globe",
    label: "Globe",
    Icon: IconGlobe,
    keywords: "world web internet earth",
  },
  {
    id: "pin",
    label: "Pin",
    Icon: IconLocation,
    keywords: "location place map marker",
  },
  {
    id: "plane",
    label: "Plane",
    Icon: IconPlane,
    keywords: "travel flight trip airport",
  },
  {
    id: "house",
    label: "House",
    Icon: IconHouse,
    keywords: "home living place",
  },
  {
    id: "inbox",
    label: "Inbox",
    Icon: IconInbox,
    keywords: "tray incoming unsorted",
  },
  {
    id: "lightbulb",
    label: "Lightbulb",
    Icon: IconLightbulb,
    keywords: "idea inspiration bulb",
  },
  {
    id: "flag",
    label: "Flag",
    Icon: IconFlag,
    keywords: "milestone goal report",
  },
  {
    id: "trophy",
    label: "Trophy",
    Icon: IconTrophy,
    keywords: "award win achievement",
  },
  {
    id: "rocket",
    label: "Rocket",
    Icon: IconRocket,
    keywords: "launch startup space",
  },
  {
    id: "gamepad",
    label: "Gamepad",
    Icon: IconGamepad,
    keywords: "games gaming controller play",
  },
  {
    id: "leaf",
    label: "Leaf",
    Icon: IconLeaf,
    keywords: "nature plant garden green",
  },
  {
    id: "shopping",
    label: "Shopping",
    Icon: IconBagShopping,
    keywords: "bag store buy",
  },
  {
    id: "briefcase",
    label: "Briefcase",
    Icon: IconBriefcase,
    keywords: "work job business",
  },
  {
    id: "office",
    label: "Office",
    Icon: IconBuilding,
    keywords: "building work company",
  },
  {
    id: "calendar",
    label: "Calendar",
    Icon: IconCalendar,
    keywords: "date schedule event",
  },
  {
    id: "checklist",
    label: "Checklist",
    Icon: IconCheckList,
    keywords: "todo tasks list",
  },
  {
    id: "clipboard",
    label: "Clipboard",
    Icon: IconClipboard,
    keywords: "copy tasks board",
  },
  {
    id: "mail",
    label: "Mail",
    Icon: IconEnvelope,
    keywords: "email envelope letter",
  },
  {
    id: "chat",
    label: "Chat",
    Icon: IconChatBubble,
    keywords: "message conversation talk",
  },
  {
    id: "bell",
    label: "Bell",
    Icon: IconBell,
    keywords: "notification alert reminder",
  },
  {
    id: "mind-map",
    label: "Mind Map",
    Icon: IconMindMap,
    keywords: "diagram brainstorm ideas",
  },
  {
    id: "stopwatch",
    label: "Stopwatch",
    Icon: IconStopwatch,
    keywords: "timer time clock",
  },
  {
    id: "person",
    label: "Person",
    Icon: IconUser,
    keywords: "user people profile",
  },
  {
    id: "pencil",
    label: "Pencil",
    Icon: IconPencil,
    keywords: "edit write draw",
  },
  {
    id: "paperclip",
    label: "Paperclip",
    Icon: IconPaperclip,
    keywords: "attachment clip",
  },
  {
    id: "wallet",
    label: "Wallet",
    Icon: IconWallet,
    keywords: "money finance budget",
  },
  {
    id: "credit-card",
    label: "Credit Card",
    Icon: IconCreditCard,
    keywords: "payment money finance",
  },
  {
    id: "coins",
    label: "Coins",
    Icon: IconCoins,
    keywords: "money finance savings",
  },
  {
    id: "receipt",
    label: "Receipt",
    Icon: IconReceipt,
    keywords: "invoice expense bill",
  },
  {
    id: "chart",
    label: "Chart",
    Icon: IconChartBar,
    keywords: "graph stats analytics",
  },
  {
    id: "cart",
    label: "Cart",
    Icon: IconCart,
    keywords: "shopping store buy",
  },
  {
    id: "gift",
    label: "Gift",
    Icon: IconGift,
    keywords: "present birthday wishlist",
  },
  {
    id: "diamond",
    label: "Diamond",
    Icon: IconDiamond,
    keywords: "gem jewel premium",
  },
  {
    id: "computer",
    label: "Computer",
    Icon: IconComputer,
    keywords: "desktop mac laptop screen",
  },
  {
    id: "phone",
    label: "Phone",
    Icon: IconPhone,
    keywords: "mobile iphone call",
  },
  {
    id: "terminal",
    label: "Terminal",
    Icon: IconTerminal,
    keywords: "command line shell code",
  },
  {
    id: "bug",
    label: "Bug",
    Icon: IconBug,
    keywords: "debug issue insect",
  },
  {
    id: "chip",
    label: "Chip",
    Icon: IconChip,
    keywords: "hardware processor electronics",
  },
  {
    id: "server",
    label: "Server",
    Icon: IconServer,
    keywords: "hosting backend infrastructure",
  },
  {
    id: "database",
    label: "Database",
    Icon: IconCylinder,
    keywords: "data storage sql",
  },
  {
    id: "settings",
    label: "Settings",
    Icon: IconGear3,
    keywords: "gear preferences config",
  },
  {
    id: "tools",
    label: "Tools",
    Icon: IconSettingsWrench,
    keywords: "wrench repair fix",
  },
  {
    id: "lock",
    label: "Lock",
    Icon: IconLock,
    keywords: "private secure password",
  },
  {
    id: "shield",
    label: "Shield",
    Icon: IconShieldCheck,
    keywords: "security safe protection",
  },
  {
    id: "key",
    label: "Key",
    Icon: IconKey,
    keywords: "password access unlock",
  },
  {
    id: "link",
    label: "Link",
    Icon: IconLink2,
    keywords: "url chain web",
  },
  {
    id: "map",
    label: "Map",
    Icon: IconMap,
    keywords: "travel directions atlas",
  },
  {
    id: "compass",
    label: "Compass",
    Icon: IconCompass,
    keywords: "explore navigation direction",
  },
  {
    id: "car",
    label: "Car",
    Icon: IconCar,
    keywords: "drive vehicle auto",
  },
  {
    id: "suitcase",
    label: "Suitcase",
    Icon: IconSuitcase,
    keywords: "travel luggage trip",
  },
  {
    id: "mountain",
    label: "Mountain",
    Icon: IconMountain,
    keywords: "hike outdoors landscape nature",
  },
  {
    id: "sun",
    label: "Sun",
    Icon: IconSun,
    keywords: "day summer weather light",
  },
  {
    id: "moon",
    label: "Moon",
    Icon: IconMoon,
    keywords: "night dark sleep",
  },
  {
    id: "graduation-cap",
    label: "Graduation Cap",
    Icon: IconGraduationCap,
    keywords: "school education study university",
  },
  {
    id: "flask",
    label: "Flask",
    Icon: IconFlask,
    keywords: "science lab experiment chemistry",
  },
  {
    id: "atom",
    label: "Atom",
    Icon: IconAtom,
    keywords: "science physics",
  },
  {
    id: "calculator",
    label: "Calculator",
    Icon: IconCalculator,
    keywords: "math numbers finance",
  },
  {
    id: "research",
    label: "Research",
    Icon: IconMagnifier,
    keywords: "search magnifier find",
  },
  {
    id: "coffee",
    label: "Coffee",
    Icon: IconCoffee,
    keywords: "cafe drink cup",
  },
  {
    id: "food",
    label: "Food",
    Icon: IconForkKnife,
    keywords: "recipes cooking restaurant fork knife",
  },
  {
    id: "dumbbell",
    label: "Dumbbell",
    Icon: IconDumbbell,
    keywords: "fitness gym workout",
  },
  {
    id: "paw",
    label: "Paw",
    Icon: IconPaw,
    keywords: "pets animal dog cat",
  },
  {
    id: "headphones",
    label: "Headphones",
    Icon: IconHeadphones,
    keywords: "audio music podcast",
  },
  {
    id: "microphone",
    label: "Microphone",
    Icon: IconMicrophone,
    keywords: "podcast audio recording voice",
  },
  {
    id: "movie",
    label: "Movie",
    Icon: IconMovie,
    keywords: "film cinema clapperboard",
  },
  {
    id: "tv",
    label: "TV",
    Icon: IconTv,
    keywords: "television shows series",
  },
  {
    id: "ticket",
    label: "Ticket",
    Icon: IconTicket,
    keywords: "event concert pass",
  },
  {
    id: "dice",
    label: "Dice",
    Icon: IconDice,
    keywords: "games random luck",
  },
  {
    id: "smile",
    label: "Smile",
    Icon: IconFaceSmile,
    keywords: "happy emoji face fun",
  },
  {
    id: "flame",
    label: "Flame",
    Icon: IconFlame,
    keywords: "fire hot trending",
  },
  {
    id: "archive",
    label: "Archive",
    Icon: IconArchive,
    keywords: "box storage old",
  },
  {
    id: "package",
    label: "Package",
    Icon: IconPackage,
    keywords: "box delivery parcel",
  },
  {
    id: "shapes",
    label: "Shapes",
    Icon: IconFigures,
    keywords: "figures geometry design",
  },
  {
    id: "document",
    label: "Document",
    Icon: IconFile,
    keywords: "file paper page",
  },
  {
    id: "magic",
    label: "Magic Wand",
    Icon: IconMagicWand,
    keywords: "wand spell sparkle",
  },
];

/** Context menus list only the first icons; the full set lives in Customize Folder. */
export const FOLDER_MENU_ICONS = FOLDER_ICONS.slice(0, 6);

export function FolderIcon({
  name,
  size,
  color,
}: {
  name?: string;
  size?: number;
  color?: string | null;
}) {
  const Icon =
    FOLDER_ICONS.find((item) => item.id === name)?.Icon ?? IconFolder;
  const css = folderColorCss(color);
  return <Icon size={size} style={css ? { color: css } : undefined} />;
}

export const FOLDER_SWATCHES = [
  { id: null, label: "Default", css: "var(--ds-gray-8)" },
  { id: "red", label: "Red", css: "var(--ds-red-9)" },
  { id: "orange", label: "Orange", css: "var(--ds-orange-9)" },
  { id: "yellow", label: "Yellow", css: "var(--ds-yellow-9)" },
  { id: "green", label: "Green", css: "var(--ds-green-9)" },
  { id: "teal", label: "Teal", css: "var(--ds-teal-9)" },
  { id: "blue", label: "Blue", css: "var(--ds-blue-9)" },
  { id: "purple", label: "Purple", css: "var(--ds-purple-9)" },
  { id: "pink", label: "Pink", css: "var(--ds-pink-9)" },
] as const;

function searchTerms(icon: FolderIconOption): string[] {
  return `${icon.label} ${icon.id.replaceAll("-", " ")} ${icon.keywords}`
    .toLowerCase()
    .split(/\s+/);
}

/** Every query word must start a word in the icon's name or keywords; name matches sort first. */
export function searchFolderIcons(query: string): readonly FolderIconOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return FOLDER_ICONS;
  const named = (icon: FolderIconOption) =>
    words.every((word) =>
      icon.label
        .toLowerCase()
        .split(/\s+/)
        .some((term) => term.startsWith(word)),
    );
  return FOLDER_ICONS.filter((icon) => {
    const terms = searchTerms(icon);
    return words.every((word) => terms.some((term) => term.startsWith(word)));
  }).sort((left, right) => Number(named(right)) - Number(named(left)));
}

/** The color as stored, for swatches that preview exactly what was picked. */
export function folderSwatchCss(
  color: string | null | undefined,
): string | undefined {
  if (!color) return undefined;
  const swatch = FOLDER_SWATCHES.find((item) => item.id === color);
  if (swatch) return swatch.css;
  return color.startsWith("#") ? color : undefined;
}

/** Custom colors keep their hue but clamp lightness to the theme's band, so a near-white or near-black pick stays visible. */
export function folderColorCss(
  color: string | null | undefined,
): string | undefined {
  const css = folderSwatchCss(color);
  if (!css || !color?.startsWith("#")) return css;
  return `oklch(from ${css} clamp(var(--folder-ink-min, 0), l, var(--folder-ink-max, 1)) c h)`;
}
