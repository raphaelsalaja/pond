import { LOCKUP_LENGTH, scenes } from "@pond/video";

const LOGO = 17_500;

export const { start, end } = scenes({
  hook: [0, 2800],
  reveal: [2800, 5600],
  typo: [5600, 8600],
  list: [8600, 12_000],
  actions: [12_000, 14_800],
  added: [14_800, 17_300],
  outro: [17_300, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  windowRise: 2780,
  menuOpen: 3800,
  pushIn: 4900,
  letter: 95,
  typoType: 5750,
  selectAll: 8650,
  chairType: 8950,
  down: 10_900,
  tab: 12_000,
  filterType: 12_700,
  enterFolder: 13_550,
  folderType: 14_050,
  enterChairs: 14_750,
  folderFocus: 15_650,
  added: 15_700,
  logo: LOGO,
} as const;
