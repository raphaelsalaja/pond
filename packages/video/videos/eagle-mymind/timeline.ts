import { scenes } from "@pond/video";

export const { start, end } = scenes({
  hook: [0, 3100],
  menu: [3100, 5400],
  eagle: [5400, 10_400],
  detail: [10_400, 13_500],
  mymind: [13_500, 17_900],
  outro: [17_900, 22_400],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  windowRise: 3080,
  plusClick: 4050,
  importHover: 4350,
  eagleClick: 5000,
  folderLand: 5900,
  folderStep: 190,
  smartLand: 7250,
  eagleDone: 8900,
  detailRow: 11_100,
  detailStep: 170,
  csvRow: 14_700,
  csvStep: 700,
  logo: 18_000,
} as const;
