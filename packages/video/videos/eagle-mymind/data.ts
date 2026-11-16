import type { Brand } from "@pond/video";

export interface Shot {
  id: string;
  title: string;
  aspect: number;
  ext?: string;
}

export const media = (id: string) => `/media/${id}.jpg`;

/** The Eagle library's items, in the order they land in the grid. */
export const EAGLE: Shot[] = [
  {
    id: "01M1Z5EJM0DK2SN3NBPY1SKNYD",
    title: "Lemaire AW25, look 28",
    aspect: 1066 / 1600,
  },
  {
    id: "01M1Z5DRYKKHRGE6G1HJY7NTTH",
    title: "Leather lounge chair",
    aspect: 1,
  },
  {
    id: "01M1Z7ARH04054W1M4T6WP648N",
    title: "iFest identity",
    aspect: 1,
    ext: "PNG",
  },
  {
    id: "01KXP2R8T53GXNDE6MF689MAE4",
    title: "Zweifel studio",
    aspect: 480 / 320,
  },
  {
    id: "01M1Z5EJM4EJSHHMAQGT0583JE",
    title: "Auralee FW26, look 22",
    aspect: 1066 / 1600,
  },
  {
    id: "01M1Z7ARJ82B6CY1J9QHHXH33R",
    title: "911 GT3",
    aspect: 1280 / 1600,
    ext: "HEIC",
  },
  {
    id: "01KXAYVKHQ8R54NXFAKFD793TA",
    title: "Wicker chair",
    aspect: 480 / 640,
  },
  { id: "01M1Z7ARH6SPW2625B2BVKB13D", title: "Grey suit", aspect: 1600 / 1593 },
  {
    id: "01KTK26F2WYAW8DMSMD0KAXNKW",
    title: "Still life, camera",
    aspect: 480 / 600,
    ext: "PSD",
  },
  {
    id: "01M1Z7ARH5ZSSS2T9HF1QE5FP4",
    title: "Light study",
    aspect: 1165 / 1600,
    ext: "TIFF",
  },
  {
    id: "01KXPDEGV9YA8Q39G77V3HS3AA",
    title: "Kiladalen cabin",
    aspect: 480 / 318,
  },
  {
    id: "01M1Z7ARGSQ85GMFQE7YBRN8TM",
    title: "White shirt",
    aspect: 1281 / 1600,
  },
  { id: "01KXAYBQZS585AQJPP3ZGZAD22", title: "Natural Selection", aspect: 1 },
  {
    id: "01M1Z5EJKDE6MXYCBN9G0EVBA8",
    title: "Fur coat, runway",
    aspect: 1066 / 1600,
  },
  {
    id: "01KXP2TKF2ZN07QE8NDD0S5V5B",
    title: "Studio storage",
    aspect: 480 / 720,
  },
  {
    id: "01M1Z5DRYJFGZ37JBZGDQ2HYE5",
    title: "Silver 911",
    aspect: 1365 / 1600,
  },
  {
    id: "01M1Z7ARH5KKCAA5676VAJQKFT",
    title: "Patchwork knit",
    aspect: 1066 / 1600,
  },
  { id: "01KTK26F2XJJNW26QWYQJDWR2D", title: "Travel bag", aspect: 480 / 640 },
  {
    id: "01M1Z5EJK6338MH34BE28RPEV9",
    title: "Desk at night",
    aspect: 1200 / 1600,
  },
  {
    id: "01M1Z7ARH75TKXT6577DXZ09K4",
    title: "Long black coat",
    aspect: 1283 / 1600,
  },
  { id: "01M1Z4YDVSSMZ9HBAJ8B9PYRJC", title: "Mouse", aspect: 1200 / 1600 },
  {
    id: "01M1Z7ARH6JMZRVWDK5GHMM07P",
    title: "Black suit",
    aspect: 1200 / 1600,
  },
  {
    id: "01M1Z5EJJZENDX1MP63R4Z2Q1B",
    title: "Black coat",
    aspect: 1066 / 1600,
  },
  {
    id: "01M1Z5EJM0GC3F3SAZY59BDKCR",
    title: "Lemaire AW25, look 36",
    aspect: 1066 / 1600,
  },
];

export interface Folder {
  name: string;
  color: string;
  count: number;
  depth?: number;
}

/** Eagle's folder tree, with the Pond swatch each Eagle color maps to. */
export const FOLDERS: Folder[] = [
  { name: "Fashion", color: "var(--ds-orange)", count: 96 },
  { name: "Runway", color: "var(--ds-orange)", count: 41, depth: 1 },
  { name: "Interiors", color: "var(--ds-green)", count: 58 },
  { name: "Objects", color: "var(--ds-purple)", count: 37 },
  { name: "Cars", color: "var(--ds-blue)", count: 12 },
  { name: "Branding", color: "var(--ds-red)", count: 23 },
];

export const SMART = ["Five Stars", "Warm Palette"];

export const EAGLE_TOTAL = 248;

export const DETAIL = {
  id: "01M1Z5EJM0DK2SN3NBPY1SKNYD",
  title: "Lemaire AW25, look 28",
  colors: ["#e8f2f2", "#b8b19b", "#8a754c", "#674d27", "#b48b8c"],
  tags: ["runway", "lemaire", "aw25"],
  url: "are.na/block/43450777",
  note: "Shoulder line for the spring shoot.",
};

export interface Card {
  id: string;
  type: string;
  title: string;
  url: string;
  note: string;
  tags: string[];
  created: string;
  shown: string;
  aspect: number;
  /** The library item that shows this card. */
  media: string;
}

/** Rows of the mymind `cards.csv`. Only the first three become cards on screen. */
export const MYMIND: Card[] = [
  {
    id: "k2x9a7",
    type: "Video",
    title: "The Tofino Riders: A 1,000 Year-Old-Wave",
    url: "youtube.com/watch?v=7nJdEXpvi1g",
    note: "Cold water, warm grade.",
    tags: ["surf", "film"],
    created: "2025-03-14T08:21:00Z",
    shown: "2025/03/14 08:21",
    aspect: 480 / 360,
    media: "01KXAY0V7VATNMMA6XFEEQ8YAR",
  },
  {
    id: "p4m1c8",
    type: "Image",
    title: "Ikebana",
    url: "are.na/block/110318",
    note: "Reference for the spring card.",
    tags: ["botanical"],
    created: "2024-11-02T19:05:00Z",
    shown: "2024/11/02 19:05",
    aspect: 480 / 655,
    media: "01KXA1D4FYF5GS2YFZT17AAQR3",
  },
  {
    id: "r7d3f2",
    type: "Article",
    title: "Kiladalen cabin, Vardehaugen",
    url: "cosmos.so/e/1838762723",
    note: "Roofline and timber.",
    tags: ["architecture", "cabin"],
    created: "2025-06-21T12:40:00Z",
    shown: "2025/06/21 12:40",
    aspect: 480 / 318,
    media: "01KXPDEGV9YA8Q39G77V3HS3AA",
  },
];

export const ALL_MEDIA = [
  ...EAGLE.map((shot) => shot.id),
  ...MYMIND.map((card) => card.media),
];

/** Brand chips in captions, keyed by the chip's text. Colors are sampled from each app's icon. */
export const BRANDS = {
  eagle: { logo: "/media/logo-eagle.png", color: "#1563e7" },
  mymind: { logo: "/media/logo-mymind.png", color: "#ff5924" },
} satisfies Record<string, Brand>;
