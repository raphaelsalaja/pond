import dot from "./parts/dot.mjs";

export default (h, s) => {
  const [cx, cy, r] = s.keylines.circle;
  return [h.circle(cx, cy, r), h.circle(cx, cy, 3.125), dot(h, s, cx, cy)];
};

/** The record is pulled out in front of its sleeve; the sleeve's edges stop where the record covers them. */
export const open = (h, s) => {
  const [x0, y0] = [2.375, 2.375];
  const side = 9;
  const [x1, y1] = [x0 + side, y0 + side];
  const r = 5.375;
  const [cx, cy] = [15.625 - r, 15.625 - r];
  const meet = Math.sqrt(r * r - (x1 - cx) ** 2);
  return [
    h.poly(
      [
        [x1, cy - meet],
        [x1, y0],
        [x0, y0],
        [x0, y1],
        [cx - meet, y1],
      ],
      { corners: { 1: s.box, 2: s.box, 3: s.box } },
    ),
    h.circle(cx, cy, r),
    h.circle(cx, cy, 3),
    dot(h, s, cx, cy),
  ];
};
