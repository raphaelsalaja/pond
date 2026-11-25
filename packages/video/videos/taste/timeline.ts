import { LOCKUP_LENGTH, scenes } from "@pond/video";

const LOGO = 19_300;

export const { start, end } = scenes({
  prompt: [0, 3600],
  board: [3600, 8300],
  lab: [8300, 12_900],
  audit: [12_900, 17_300],
  taste: [17_300, LOGO],
  outro: [LOGO, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. */
export const CUES = {
  composerIn: 150,
  typeStart: 400,
  typeLength: 1500,
  send: 2000,
  search: 2200,
  searchStep: 160,
  searchDone: 380,
  promptOut: 3350,
  boardIn: 3500,
  tiles: 3900,
  tileStep: 70,
  boardPan: 5000,
  boardOut: 7950,
  labIn: 8250,
  rooms: 8500,
  roomStep: 110,
  labOut: 12_550,
  auditIn: 12_850,
  findings: 13_150,
  findingStep: 140,
  picks: 15_500,
  pickStep: 300,
  auditOut: 16_950,
  logo: LOGO,
} as const;
