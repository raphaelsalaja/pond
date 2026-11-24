import { poly } from "../../helpers.mjs";

/** Axis heads reach 4.5 back, diagonal heads have 5.5 arms; small heads sit with other shapes and scale the corner with them. */
export const sizes = {
  axis: 4.5,
  diagonal: 5.5,
  small: 3.5,
  "small-diagonal": 4.25,
};

export const head = (s, [x, y], [dx, dy], size = false) => {
  const diagonal = dx !== 0 && dy !== 0;
  const full = diagonal ? sizes.diagonal : sizes.axis;
  const k =
    size === true
      ? sizes[diagonal ? "small-diagonal" : "small"]
      : size === false
        ? full
        : size;
  const points = diagonal
    ? [
        [x - dx * k, y],
        [x, y],
        [x, y - dy * k],
      ]
    : [
        [x - dx * k + dy * k, y - dy * k + dx * k],
        [x, y],
        [x - dx * k - dy * k, y - dy * k - dx * k],
      ];
  return poly(points, { radius: (s.ease * k) / full });
};

export const arrow = (s, [x0, y0], [x1, y1], size = false) => [
  `M ${x0} ${y0} L ${x1} ${y1}`,
  head(s, [x1, y1], [Math.sign(x1 - x0), Math.sign(y1 - y0)], size),
];
