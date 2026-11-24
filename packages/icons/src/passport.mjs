const cover = ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  return rect(x0, y0, x1 - x0, y1 - y0, s.box);
};

export default (h, s) => {
  const [cx, cy, r] = [9, 7.625, 2.5];
  return [
    cover(h, s),
    h.circle(cx, cy, r),
    `M ${cx - r} ${cy} H ${cx + r}`,
    "M 7.25 12.625 H 10.75",
  ];
};

/** Open, the photo page shows. */
export const open = (h, s) => [
  cover(h, s),
  h.circle(9, 7, 1.75),
  "M 6.125 12.625 A 2.875 2.875 0 0 1 11.875 12.625 Z",
];
