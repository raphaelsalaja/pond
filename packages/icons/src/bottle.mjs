import { turn } from "./parts/objB-pose.mjs";

const body = (top, dx = 0) =>
  [
    [7.375, top],
    [10.625, top],
    [10.625, 6.25],
    [13.125, 8.75],
    [13.125, 15.625],
    [4.875, 15.625],
    [4.875, 8.75],
    [7.375, 6.25],
  ].map(([x, y]) => [x + dx, y]);

export default ({ poly }, s) => [
  poly(body(2.375), { closed: true, radius: s.ease, corners: { 4: s.box, 5: s.box } }),
  "M 7.375 4.75 H 10.625",
];

/** The bottle steps left so the cap, the same size as the closed one, tips clear of the open neck. */
export const open = ({ poly, rect }, s) => {
  const b = body(4.75, -1.5);
  const [cx, cy] = [13.5, 4.125];
  return [
    poly([b[1], ...b.slice(2), b[0]], { radius: s.ease, corners: { 3: s.box, 4: s.box } }),
    turn(rect(cx - 1.625, cy - 1.125, 3.25, 2.25, 0.75), 25, cx, cy),
  ];
};
