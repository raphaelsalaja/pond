import { tab } from "./folder.mjs";

/** The slanted front flap sits over the back of the folder. */
export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  const lip = 7.75;
  const back = 13.5;
  return [
    poly(
      [
        [x0, y1 - s.box],
        [x0, y0],
        [tab.end, y0],
        [tab.end + tab.drop, y0 + tab.drop],
        [back, y0 + tab.drop],
        [back, lip],
      ],
      { corners: { 1: s.box, 2: s.ease, 3: s.ease, 4: s.box } },
    ),
    poly(
      [
        [x0, y1],
        [x0 + 2, lip],
        [x1, lip],
        [x1 - 2, y1],
      ],
      { closed: true, radius: s.ease },
    ),
  ];
};
