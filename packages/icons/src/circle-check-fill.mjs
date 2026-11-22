import { bend, disc } from "./parts/system-knockout.mjs";

/** `circle-check.mjs` filled: the ring's outer edge as a disc, its check punched out. */
export default (_, s) => {
  const [cx, cy, r] = s.keylines.circle;
  const w = s.stroke / 2;
  const check = bend(
    [
      [6.125, 9.25],
      [8.25, 11.375],
      [12, 7.625],
    ],
    s.ease,
    w,
  );
  return { d: `${disc(cx, cy, r + w)} ${check}`, solid: true };
};
