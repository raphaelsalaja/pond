import { turn } from "./parts/objB-pose.mjs";

const tassel = [15.25, 6.375];

const cap = ({ poly }, s) => [
  poly(
    [
      [9, 3.375],
      [15.25, 6.375],
      [9, 9.375],
      [2.75, 6.375],
    ],
    { closed: true, radius: s.ease },
  ),
  "M 5.25 7.625 V 11.5 A 3.75 2 0 0 0 12.75 11.5 V 7.625",
];

export default (h, s) => [cap(h, s), `M ${tassel.join(" ")} V 10.75`];

/** Tossed: the cap tilts while the tassel hangs straight down from the board's near edge. */
export const open = (h, s) => {
  const a = (10 * Math.PI) / 180;
  const [dx, dy] = [14 - 9, 6.975 - 9];
  const x = h.snap(9 + dx * Math.cos(a) - dy * Math.sin(a));
  const y = h.snap(9 + dx * Math.sin(a) + dy * Math.cos(a));
  return [turn(cap(h, s), 10), `M ${x} ${y} V ${y + 3.5}`];
};
