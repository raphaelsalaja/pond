import { arc, circle, poly, snap } from "../../helpers.mjs";

/** A badge glyph sits bottom right in a 5 box; the host's lines stop where they meet the hole around it. */
export const at = { cx: 13.125, cy: 13.125, half: 2.5, hole: 5 };

const { cx, cy, half } = at;
const [lo, hi] = [cx - half, cx + half];
const head = (points) => poly(points, { radius: 1.25 });

/** Where a host line at `v` on the other axis meets the hole, from the top or left; null when it misses. */
export const edge = (v, hole = at.hole) => {
  const d = v - cy;
  return Math.abs(d) >= hole ? null : snap(cx - Math.sqrt(hole * hole - d * d));
};

const pen = () => {
  const u = [Math.SQRT1_2, -Math.SQRT1_2];
  const n = [Math.SQRT1_2, Math.SQRT1_2];
  const p = (along, across) => [
    snap(lo + 0.125 + u[0] * along + n[0] * across),
    snap(hi - 0.125 + u[1] * along + n[1] * across),
  ];
  return poly(
    [p(0, 0), p(1.75, 1.125), p(6.25, 1.125), p(6.25, -1.125), p(1.75, -1.125)],
    {
      closed: true,
      corners: { 0: 0.375, 1: 0.5, 2: 0.75, 3: 0.75, 4: 0.5 },
    },
  );
};

export const glyphs = {
  plus: () => `M ${lo} ${cy} H ${hi} M ${cx} ${lo} V ${hi}`,
  minus: () => `M ${lo} ${cy} H ${hi}`,
  xmark: () =>
    `M ${lo + 0.5} ${lo + 0.5} L ${hi - 0.5} ${hi - 0.5} M ${hi - 0.5} ${lo + 0.5} L ${lo + 0.5} ${hi - 0.5}`,
  check: () =>
    head([
      [lo, cy + 0.25],
      [lo + 1.875, hi - 0.625],
      [hi, lo + 0.875],
    ]),
  "arrow-down": () => [
    `M ${cx} ${lo} V ${hi}`,
    head([
      [lo + 0.25, hi - 2.25],
      [cx, hi],
      [hi - 0.25, hi - 2.25],
    ]),
  ],
  "arrow-right": () => [
    `M ${lo} ${cy} H ${hi}`,
    head([
      [hi - 2.25, lo + 0.25],
      [hi, cy],
      [hi - 2.25, hi - 0.25],
    ]),
  ],
  "arrow-up-right": () => [
    `M ${lo + 0.25} ${hi - 0.25} L ${hi} ${lo}`,
    head([
      [lo + 1.25, lo],
      [hi, lo],
      [hi, hi - 1.25],
    ]),
  ],
  pen,
  search: () => [
    circle(cx - 0.5, cy - 0.5, 2),
    `M ${cx + 1} ${cy + 1} L ${hi} ${hi}`,
  ],
  refresh: () => {
    const r = 2;
    const a = Math.PI / 3;
    const end = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const back = [Math.sin(a), -Math.cos(a)];
    const arm = (turn) => {
      const c = Math.cos(turn),
        s = Math.sin(turn);
      return [
        snap(end[0] + 1.5 * (back[0] * c - back[1] * s)),
        snap(end[1] + 1.5 * (back[0] * s + back[1] * c)),
      ];
    };
    return [
      arc(cx, cy, r, 150, 420),
      head([arm(Math.PI / 4), end.map(snap), arm(-Math.PI / 4)]),
    ];
  },
  ban: () => {
    const k = snap(2.5 * Math.SQRT1_2);
    return [circle(cx, cy, 2.5), `M ${cx - k} ${cy - k} L ${cx + k} ${cy + k}`];
  },
  bolt: () =>
    poly(
      [
        [cx + 0.875, lo],
        [lo + 0.125, cy + 0.125],
        [hi - 0.125, cy - 0.125],
        [cx - 0.875, hi],
      ],
      { radius: 0.5 },
    ),
};

export default (name) => glyphs[name]();
