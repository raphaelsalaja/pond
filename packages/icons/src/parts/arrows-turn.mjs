import { arc, poly, snap } from "../../helpers.mjs";

/** The refresh arc and corner head on one sweep; `mirror` turns it anticlockwise. */
export default (s, mirror = false) => {
  const r = 6;
  const [start, end] = [0, 315];
  const arm = 2.5;
  const px = snap(9 + r * Math.cos((end * Math.PI) / 180));
  const py = snap(9 + r * Math.sin((end * Math.PI) / 180));
  const x = (v) => (mirror ? 18 - v : v);
  const sx = mirror ? -1 : 1;
  return [
    mirror ? arc(9, 9, r, 180 - start, 180 - end) : arc(9, 9, r, start, end),
    poly(
      [
        [x(px), py - arm],
        [x(px), py],
        [x(px) - sx * arm, py],
      ],
      { radius: s.ease / 2 },
    ),
  ];
};
