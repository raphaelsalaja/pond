import { LOCKUP_LENGTH, scenes } from "@pond/video";

/** One bar at 100 BPM, so every row lands on a downbeat of the score. */
const ROW_STEP = 2400;
const ROW_COUNT = 9;
const FIRST_ROW = 5400;
const LAST_ROW = FIRST_ROW + (ROW_COUNT - 1) * ROW_STEP;
const LOGO = 31_400;

export const { start, end } = scenes({
  hook: [0, 3000],
  table: [3000, 30_800],
  outro: [30_800, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  tableRise: 3000,
  heads: 3300,
  headStep: 150,
  pondHead: 4200,
  firstRow: FIRST_ROW,
  /** Competitor cells start this long after their row's label. */
  cellLead: 300,
  cellStep: 140,
  /** Pond's cell lands two beats into its row. */
  pondCell: 1200,
  verdict: LAST_ROW + 2400,
  logo: LOGO,
} as const;

export const rowAt = (index: number) => CUES.firstRow + index * ROW_STEP;
