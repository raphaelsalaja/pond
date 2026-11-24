import { arc, cut, line, outline, ring } from "./system-cut.mjs";

/** Base icons redrawn with their own measurements, opened where the badge hole meets them. */
export const clock = (h, s) => {
  const [cx, cy, r] = s.keylines.circle;
  return [
    cut([ring(cx, cy, r)]),
    h.poly(
      [
        [9, 5.25],
        [9, 9],
        [6.5, 10.5],
      ],
      { radius: s.ease },
    ),
  ];
};

export const calendar = (_, s) => {
  const [x0, , x1, y1] = s.keylines.square;
  const top = 3.375;
  const head = 7.25;
  const box = outline(
    [
      [x0, top],
      [x1, top],
      [x1, y1],
      [x0, y1],
    ],
    { closed: true, radius: s.box },
  );
  return [
    cut(box),
    `M ${x0} ${head} H ${x1}`,
    "M 6 2.375 V 4.75",
    "M 12 2.375 V 4.75",
  ];
};

export const star = (h, s) =>
  cut(
    outline(h.starPoints(9, 9.5, 7.125, 3.375), {
      closed: true,
      radius: s.radius,
    }),
  );

export const tag = (_, s) => {
  const [lo, , hi] = s.keylines.square;
  const map = ([x, y]) => [
    lo + ((x - 2) * (hi - lo)) / 21,
    lo + ((y - 2) * (hi - lo)) / 21,
  ];
  const pts = [
    [2, 2],
    [12, 2],
    [23, 13],
    [13, 23],
    [2, 12],
  ].map(map);
  return {
    outline: outline(pts, {
      closed: true,
      radius: s.radius,
      corners: { 2: 2.25, 3: 2.25 },
    }),
    hole: map([7.25, 7.25]),
  };
};

export const user = ({ circle }, s) => {
  const [x0, , x1, y1] = s.keylines.square;
  const a = [x0 + 1.5, y1];
  const b = [x1 - 1.5, y1];
  const body = [
    arc([9, y1], (b[0] - a[0]) / 2, 4.5, Math.PI, Math.PI),
    line(b, a),
  ];
  return [circle(9, 5.75, 3), cut(body)];
};

export const trash = (h, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const lid = y0 + 2;
  const body = outline(
    [
      [x0 + 1.5, lid],
      [x1 - 1.5, lid],
      [x1 - 2.25, y1],
      [x0 + 2.25, y1],
    ],
    { closed: true, corners: { 0: 0, 1: 0, 2: s.box, 3: s.box } },
  );
  return [
    cut(body),
    `M ${x0} ${lid} H ${x1}`,
    h.poly(
      [
        [6.625, lid],
        [6.625, y0],
        [11.375, y0],
        [11.375, lid],
      ],
      { radius: s.ease },
    ),
  ];
};
