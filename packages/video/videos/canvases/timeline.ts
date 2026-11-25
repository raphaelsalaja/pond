import { LOCKUP_LENGTH, scenes } from "@pond/video";

const LOGO = 18_000;

export const { start, end } = scenes({
  hook: [0, 3000],
  board: [3000, 7400],
  notes: [7400, 12_400],
  link: [12_400, 15_600],
  wide: [15_600, 17_800],
  outro: [17_800, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  windowRise: 2980,
  pointerIn: 3900,
  addSaves: 4300,
  savesLand: 4650,
  savesStep: 150,
  noteTool: 7900,
  noteDrop: 8600,
  typing: 8800,
  typed: 10_000,
  markerTool: 10_300,
  pickRed: 10_650,
  drawStart: 11_000,
  drawEnd: 11_800,
  escape: 12_300,
  hoverLook: 12_650,
  linkPress: 13_000,
  linkDrop: 13_700,
  relinkPress: 14_200,
  relinkDrop: 14_800,
  pullBack: 15_600,
  logo: LOGO,
} as const;
