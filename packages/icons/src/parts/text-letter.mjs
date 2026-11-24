import { arc, poly, snap } from "../../helpers.mjs";

/** Letters are stroked geometry on the glyph keyline: cap height `top`, baseline `base`. */
export const top = 3.375;
export const base = 14.625;

const deg = (r) => (r * 180) / Math.PI;
const on = (cx, cy, r, a) => [
  snap(cx + r * Math.cos((a * Math.PI) / 180)),
  snap(cy + r * Math.sin((a * Math.PI) / 180)),
];

export const H = (x0, x1, t = top, b = base) => {
  const mid = snap((t + b) / 2);
  return `M ${x0} ${t} V ${b} M ${x1} ${t} V ${b} M ${x0} ${mid} H ${x1}`;
};

export const T = (x0, x1, t = top, b = base) => {
  const cx = snap((x0 + x1) / 2);
  return `M ${x0} ${t} H ${x1} M ${cx} ${t} V ${b}`;
};

/** The bar sits at 65% of the height and stops on both legs. */
export const A = (x0, x1, t = top, b = base) => {
  const cx = (x0 + x1) / 2;
  const y = snap(t + (b - t) * 0.65);
  const k = (b - y) / (b - t);
  const at = (x) => snap(x + (cx - x) * k);
  return [
    poly(
      [
        [x0, b],
        [snap(cx), t],
        [x1, b],
      ],
      { corners: { 1: 0.75 } },
    ),
    `M ${at(x0)} ${y} H ${at(x1)}`,
  ];
};

/** A single-storey a: a bowl with its stem on the right tangent. */
export const a = (x1, r, b = base, stem = 2 * r) => {
  const cx = x1 - r;
  const cy = b - r;
  return [
    `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${x1} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`,
    `M ${x1} ${b - stem} V ${b}`,
  ];
};

export const one = ({ x0, x1, t = top, b = base }, foot = true) => {
  const w = x1 - x0;
  const stem = snap(x0 + w * 0.6);
  return [
    poly(
      [
        [snap(x0 + w * 0.15), snap(t + Math.min(1.5, (b - t) * 0.25))],
        [stem, t],
        [stem, b],
      ],
      { corners: { 1: 0.5 } },
    ),
    foot ? `M ${snap(x0 + w * 0.15)} ${b} H ${x1}` : null,
  ];
};

/** The diagonal leaves the bowl on its tangent and lands on the baseline. */
export const two = ({ x0, x1, t = top, b = base }) => {
  const r = Math.min((x1 - x0) / 2, snap((b - t) * 0.36));
  const cx = (x0 + x1) / 2;
  const cy = t + r;
  const phi = deg(Math.atan2(b - cy, x0 - cx));
  const tangent = phi - deg(Math.acos(r / Math.hypot(b - cy, x0 - cx)));
  const end = tangent < 200 ? tangent + 360 : tangent;
  return [
    arc(cx, cy, r, 200, end),
    poly([on(cx, cy, r, end), [x0, b], [x1, b]], { corners: { 1: 0.5 } }),
  ];
};

/** Two stacked bowls, the lower one larger, meeting on a short bar. */
export const three = ({ x1, t = top, b = base }) => {
  const h = b - t;
  const r2 = snap(h * 0.27);
  const m = b - 2 * r2;
  const r1 = (m - t) / 2;
  const c2 = x1 - r2;
  const c1 = Math.min(x1 - 0.375 - r1, c2 + 0.5);
  return [
    arc(c1, t + r1, r1, 205, 450),
    arc(c2, b - r2, r2, 270, 510),
    `M ${snap(Math.min(c1, c2) - 0.75)} ${m} H ${Math.max(c1, c2)}`,
  ];
};

/** An open four: the left stroke turns into the bar, the stem crosses it. */
export const four = ({ x0, x1, t = top, b = base }) => {
  const bar = snap(t + (b - t) * 0.7);
  const stem = snap(x1 - (x1 - x0) * 0.3);
  return [
    poly(
      [
        [x0 + 0.5, t],
        [x0, bar],
        [x1, bar],
      ],
      { corners: { 1: 0.5 } },
    ),
    `M ${stem} ${snap(t + (b - t) * 0.35)} V ${b}`,
  ];
};

export const digits = { 1: one, 2: two, 3: three, 4: four };

/** The bold, italic, underline and strikethrough letters share one box. */
export const style = { x0: 4.875, x1: 13.125 };

/** The lower bowl is wider than the upper one; both meet the stem square. */
export const B = (x0 = style.x0, x1 = style.x1, t = top, b = base) => {
  const mid = snap(t + (b - t) * 0.47);
  const r1 = (mid - t) / 2;
  const r2 = (b - mid) / 2;
  const xt = x1 - 0.75 - r1;
  const xb = x1 - r2;
  return [
    `M ${x0} ${mid} V ${t} H ${xt} A ${r1} ${r1} 0 0 1 ${xt} ${mid} H ${xb} A ${r2} ${r2} 0 0 1 ${xb} ${b} H ${x0} Z`,
    `M ${x0} ${mid} H ${xt}`,
  ];
};

/** A slanted stem between two serifs. */
export const I = (x0 = style.x0, x1 = style.x1, t = top, b = base) => {
  const w = snap((x1 - x0) * 0.55);
  return [
    `M ${x1 - w} ${t} H ${x1}`,
    `M ${x1 - w / 2} ${t} L ${x0 + w / 2} ${b}`,
    `M ${x0} ${b} H ${x0 + w}`,
  ];
};

/** A U whose bowl is a half circle across its width. */
export const U = (
  x0 = style.x0,
  x1 = style.x1,
  t = top - 1,
  b = base - 2.5,
) => {
  const r = (x1 - x0) / 2;
  return `M ${x0} ${t} V ${b - r} A ${r} ${r} 0 0 0 ${x1} ${b - r} V ${t}`;
};

/** A two-arc S whose spine runs on the common tangent, so a strike crosses it, not merges. */
export const S = (x0, x1, t = top, b = base) => {
  const r = snap((b - t) * 0.22);
  const cx = (x0 + x1) / 2;
  const c1 = [cx, t + r];
  const c2 = [cx, b - r];
  const d = (c2[1] - c1[1]) / 2;
  const theta = deg(Math.asin(r / d));
  const p1 = on(c1[0], c1[1], r, 180 - theta);
  const p2 = on(c2[0], c2[1], r, -theta);
  return [
    `M ${x1} ${t} H ${cx}`,
    arc(c1[0], c1[1], r, 270, 180 - theta),
    `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]}`,
    arc(c2[0], c2[1], r, -theta, 90),
    `M ${cx} ${b} H ${x0}`,
  ];
};
