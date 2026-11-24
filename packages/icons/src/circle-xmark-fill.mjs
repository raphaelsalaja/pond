import { cross, disc } from "./parts/system-knockout.mjs";

/** `circle-xmark.mjs` filled: the ring's outer edge as a disc, its cross punched out. */
export default (_, s) => {
  const [cx, cy, r] = s.keylines.circle;
  const w = s.stroke / 2;
  return {
    d: `${disc(cx, cy, r + w)} ${cross(cx, cy, 2.375 * Math.SQRT2, w)}`,
    solid: true,
  };
};
