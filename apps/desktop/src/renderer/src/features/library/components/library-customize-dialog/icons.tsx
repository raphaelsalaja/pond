import {
  IconAlbum2,
  IconBagShopping,
  IconBook,
  IconBookmark,
  IconCamera,
  IconCode2,
  IconCube,
  IconDownload,
  IconFlag,
  IconGamepad,
  IconGlobe,
  IconHashtag,
  IconHeart,
  IconHouse,
  IconImage,
  IconInbox,
  IconLayers,
  IconLeaf,
  IconLightbulb,
  IconLocation,
  IconMagnifier,
  IconMusicNote,
  IconNote,
  IconPaintbrush,
  IconPalette,
  IconPlane,
  IconRocket,
  IconSparkle,
  IconStar,
  IconTrophy,
  IconTypography,
  IconVideo,
} from "@pond/icons";
import type { IconComponent, IconProps } from "@pond/icons/types";
import { LOGO_PATH, LOGO_VIEW_BOX } from "@pond/ui";
import { FOLDER_ICONS, type FolderIconId } from "@/shared/lib/folder-icons";

/** Padded so the mark sits at the optical size of the 18px fill icons. */
const POND_INSET = 24;

function PondIcon({ size = 18 }: IconProps) {
  const box = LOGO_VIEW_BOX + POND_INSET * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${-POND_INSET} ${-POND_INSET} ${box} ${box}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      aria-hidden
    >
      <path fillRule="evenodd" clipRule="evenodd" d={LOGO_PATH} />
    </svg>
  );
}

const FILLS = {
  bookmark: IconBookmark,
  album: IconAlbum2,
  tag: IconHashtag,
  download: IconDownload,
  code: IconCode2,
  star: IconStar,
  heart: IconHeart,
  sparkle: IconSparkle,
  image: IconImage,
  camera: IconCamera,
  video: IconVideo,
  music: IconMusicNote,
  book: IconBook,
  note: IconNote,
  palette: IconPalette,
  brush: IconPaintbrush,
  typography: IconTypography,
  layers: IconLayers,
  cube: IconCube,
  globe: IconGlobe,
  pin: IconLocation,
  plane: IconPlane,
  house: IconHouse,
  inbox: IconInbox,
  lightbulb: IconLightbulb,
  flag: IconFlag,
  trophy: IconTrophy,
  rocket: IconRocket,
  gamepad: IconGamepad,
  leaf: IconLeaf,
  shopping: IconBagShopping,
  research: IconMagnifier,
} satisfies Partial<Record<Exclude<FolderIconId, "folder">, IconComponent>>;

type FilledIconId = keyof typeof FILLS;

export type LibraryIconId = "pond" | FilledIconId;

/** Logos are drawn solid, so only folder icons with a fill drawing are offered. */
function isFilled(id: FolderIconId): id is FilledIconId {
  return id in FILLS;
}

export const LIBRARY_ICONS: readonly {
  id: LibraryIconId;
  label: string;
  Icon: IconComponent;
}[] = [
  { id: "pond", label: "Pond", Icon: PondIcon },
  ...FOLDER_ICONS.flatMap(({ id, label }) =>
    isFilled(id) ? [{ id, label, Icon: FILLS[id] }] : [],
  ),
];

export function LibraryIcon({
  name,
  size,
}: {
  name: LibraryIconId;
  size?: number;
}) {
  const Icon = LIBRARY_ICONS.find((item) => item.id === name)?.Icon ?? PondIcon;
  return <Icon size={size} />;
}

const HUES = [
  ["red", "Red"],
  ["orange", "Orange"],
  ["gold", "Gold"],
  ["yellow", "Yellow"],
  ["lime", "Lime"],
  ["green", "Green"],
  ["jade", "Jade"],
  ["teal", "Teal"],
  ["cyan", "Cyan"],
  ["blue", "Blue"],
  ["indigo", "Indigo"],
  ["violet", "Violet"],
  ["purple", "Purple"],
  ["magenta", "Magenta"],
  ["pink", "Pink"],
] as const;

export interface LibrarySwatch {
  id: string;
  label: string;
  fill: string;
  contrast: string;
}

/** Step 9 is identical in light and dark themes, so saved logos look the same in both. */
export const LIBRARY_SWATCHES: readonly LibrarySwatch[] = [
  ...HUES.map(([hue, label]) => ({
    id: hue,
    label,
    fill: `var(--ds-${hue})`,
    contrast: `var(--ds-${hue}-contrast)`,
  })),
  ...HUES.map(([hue, label]) => ({
    id: `${hue}-bright`,
    label: `Bright ${label}`,
    fill: `oklch(from var(--ds-${hue}) calc(l + 0.12) calc(c * 1.1) h)`,
    contrast: `var(--ds-${hue}-contrast)`,
  })),
];

export const LIBRARY_HUE_COUNT = HUES.length;

export const DEFAULT_LIBRARY_SWATCH: LibrarySwatch = {
  id: "blue",
  label: "Blue",
  fill: "var(--ds-blue)",
  contrast: "var(--ds-blue-contrast)",
};
