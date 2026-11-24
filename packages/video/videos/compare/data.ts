import type { Brand } from "@pond/video";

export interface Rival {
  id: string;
  name: string;
  logo: string;
}

/** Competitors in column order. Pond's column always comes last. */
export const RIVALS: Array<Rival> = [
  { id: "mymind", name: "mymind", logo: "/media/logo-mymind.png" },
  { id: "eagle", name: "Eagle", logo: "/media/logo-eagle.png" },
  { id: "raindrop", name: "Raindrop.io", logo: "/media/logo-raindrop.png" },
  { id: "karakeep", name: "Karakeep", logo: "/media/logo-karakeep.png" },
];

/** A check, a partial answer, a cross, or a short line of text such as a price. */
export type Mark = "yes" | "partly" | "no" | { text: string };

export interface Row {
  label: string;
  /** One mark per rival, in `RIVALS` order. */
  rivals: Array<Mark>;
  pond: Mark;
}

/** Read from each vendor's own site in November 2026. */
export const ROWS: Array<Row> = [
  {
    label: "Price",
    rivals: [
      { text: "Free or $4.99/mo" },
      { text: "$34.95 once" },
      { text: "Free or $3/mo" },
      { text: "Free or $4/mo" },
    ],
    pond: { text: "Free" },
  },
  {
    label: "Free with no cap",
    rivals: ["no", "no", "partly", "partly"],
    pond: "yes",
  },
  { label: "Open source", rivals: ["no", "no", "no", "yes"], pond: "yes" },
  {
    label: "Library is a folder on your disk",
    rivals: ["no", "yes", "no", "partly"],
    pond: "yes",
  },
  {
    label: "Mac, Windows and Linux",
    rivals: ["partly", "partly", "yes", "no"],
    pond: "yes",
  },
  {
    label: "Syncs your X and Instagram saves",
    rivals: ["no", "no", "partly", "no"],
    pond: "yes",
  },
  {
    label: "AI runs on your device",
    rivals: ["no", "partly", "no", "partly"],
    pond: "yes",
  },
  {
    label: "Works offline",
    rivals: ["partly", "yes", "no", "partly"],
    pond: "yes",
  },
  {
    label: "No account needed",
    rivals: ["no", "yes", "no", "no"],
    pond: "yes",
  },
];

/** Brand chips in captions, keyed by the chip's text. Colors are sampled from each app's icon. */
export const BRANDS = {
  mymind: { logo: "/media/logo-mymind.png", color: "#ff5924" },
  Eagle: { logo: "/media/logo-eagle.png", color: "#1563e7" },
  "Raindrop.io": { logo: "/media/logo-raindrop.png", color: "#1e8fe8" },
  Karakeep: { logo: "/media/logo-karakeep.png", color: "#111111" },
} satisfies Record<string, Brand>;
