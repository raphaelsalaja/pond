import { LOCKUP_LENGTH, scenes } from "@pond/video";

const LOGO = 45_730;

export const { start, end } = scenes({
  meet: [0, 6000],
  ask: [6000, 11_000],
  routine: [11_000, 14_200],
  review: [14_200, 18_400],
  model: [18_400, 23_100],
  library: [23_100, 27_300],
  preview: [27_300, 31_900],
  sources: [31_900, 35_400],
  substack: [35_400, 40_900],
  more: [40_900, 43_130],
  release: [43_130, LOGO],
  outro: [LOGO, LOGO + LOCKUP_LENGTH],
});

export const DURATION = end("outro");

/** Beats inside scenes, in ms. `score.py` cues the same moments in seconds. */
export const CUES = {
  schoolIn: 200,
  schoolOut: 2600,
  introLine: 3200,
  introOut: 4650,
  chatRise: 5200,
  askSend: 6500,
  thinking: 7000,
  answer: 7900,
  consulted: 8700,
  routineEvent: 11_400,
  routineReply: 12_100,
  reviewCard: 13_000,
  applyClick: 16_300,
  chatAway: 18_300,
  modelRoll: 19_500,
  modelStep: 600,
  windowRise: 23_100,
  tileClick: 27_700,
  paneOpen: 27_850,
  burst: 32_050,
  burstStep: 70,
  substackFly: 34_900,
  substackRise: 34_800,
  read: 36_600,
  logo: LOGO,
} as const;
