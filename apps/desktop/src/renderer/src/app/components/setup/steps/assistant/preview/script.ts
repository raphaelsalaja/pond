export const ASK =
  "Find my beach photos from last summer and put them in a folder";

export const REPLY =
  "I found 3 beach photos from July. Review the changes before I apply them."
    .split(" ")
    .map((text, index) => ({ id: `${index}-${text}`, text }));

export const STEPS = [
  {
    running: "Searching your library",
    done: "Searched your library",
    detail: "beach, last summer · 3 Saves",
  },
  {
    running: "Examining images",
    done: "Examined images",
    detail: "3 Saves",
  },
  {
    running: "Preparing changes for review",
    done: "Prepared changes",
    detail: "2 changes",
  },
] as const;

export const TIMELINE = [
  { phase: "typing", ms: 1500 },
  { phase: "sent", ms: 600 },
  { phase: "step1", ms: 1200 },
  { phase: "step2", ms: 1100 },
  { phase: "step3", ms: 1200 },
  { phase: "reply", ms: 2600 },
  { phase: "applying", ms: 450 },
  { phase: "applied", ms: 2400 },
  { phase: "clearing", ms: 500 },
] as const;

export type Phase = (typeof TIMELINE)[number]["phase"];

export const PHASES = TIMELINE.map((entry) => entry.phase);
export const REVIEW_INDEX = PHASES.indexOf("reply");

export const WORD_S = 0.035;
export const SPRING = { type: "spring", duration: 0.5, bounce: 0 } as const;
export const SWAP = {
  initial: { opacity: 0, y: 4, filter: "blur(3px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -4, filter: "blur(3px)" },
  transition: { duration: 0.22, ease: "easeOut" },
} as const;
export const POP = {
  initial: { opacity: 0, scale: 0.4 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.4 },
  transition: { duration: 0.18 },
} as const;
