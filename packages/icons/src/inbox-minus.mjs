import badge, { edge } from "./parts/badge.mjs";

export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  const [rim, dip] = [10, 12];
  return [
    poly(
      [
        [edge(y1), y1],
        [x0, y1],
        [x0, y0],
        [x1, y0],
        [x1, edge(x1)],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box } },
    ),
    /** The dip starts a little earlier than `inbox.mjs` so its floor still runs 2 before the hole. */
    poly(
      [
        [x0, rim],
        [5, rim],
        [6, dip],
        [edge(dip), dip],
      ],
      { radius: s.ease },
    ),
    badge("minus"),
  ];
};
