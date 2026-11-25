const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => mul(a, 1 / len(a));
const left = ([x, y]) => [y, -x];
const dir = (deg) => [
  Math.cos((deg * Math.PI) / 180),
  Math.sin((deg * Math.PI) / 180),
];
const n = (v) => +(Math.round(v * 8) / 8).toFixed(3);
const pt = ([x, y]) => `${n(x)} ${n(y)}`;

/** A disc wound counterclockwise, so clockwise knockouts inside it punch through under the nonzero rule. */
export const disc = (cx, cy, r) =>
  `M ${pt([cx - r, cy])} A ${n(r)} ${n(r)} 0 1 0 ${pt([cx + r, cy])} A ${n(r)} ${n(r)} 0 1 0 ${pt([cx - r, cy])} Z`;

/** The clockwise outline of a round-capped stroke along `a`, `b`, `c`, its corner filleted the way `poly` does. */
export function bend([a, b, c], radius, w) {
  const u = unit(sub(a, b));
  const v = unit(sub(c, b));
  const angle = Math.acos(u[0] * v[0] + u[1] * v[1]);
  const la = len(sub(a, b));
  const lc = len(sub(c, b));
  let r = Math.min(radius, Math.min(la, lc) / 4);
  if (angle < Math.PI / 3) r /= 2;
  const t = Math.min(r / Math.tan(angle / 2), la / 2, lc / 2);
  r = t * Math.tan(angle / 2);
  const from = add(b, mul(u, t));
  const to = add(b, mul(v, t));
  const d1 = unit(sub(b, a));
  const d2 = unit(sub(c, b));
  const cw = d1[0] * d2[1] - d1[1] * d2[0] > 0;
  const [n1, n2] = [mul(left(d1), w), mul(left(d2), w)];
  const near = cw ? r + w : r - w;
  const far = cw ? r - w : r + w;
  const sweep = cw ? 1 : 0;
  return [
    `M ${pt(add(a, n1))}`,
    `L ${pt(add(from, n1))}`,
    `A ${n(near)} ${n(near)} 0 0 ${sweep} ${pt(add(to, n2))}`,
    `L ${pt(add(c, n2))}`,
    `A ${w} ${w} 0 0 1 ${pt(sub(c, n2))}`,
    `L ${pt(sub(to, n2))}`,
    `A ${n(far)} ${n(far)} 0 0 ${1 - sweep} ${pt(sub(from, n1))}`,
    `L ${pt(sub(a, n1))}`,
    `A ${w} ${w} 0 0 1 ${pt(add(a, n1))}`,
    "Z",
  ].join(" ");
}

/** The clockwise outline of two round-capped strokes crossing at 90° through the centre, arms `arm` long. */
export function cross(cx, cy, arm, w) {
  const c = [cx, cy];
  const notch = (deg) => add(c, mul(dir(deg), w * Math.SQRT2));
  const parts = [45, 135, 225, 315].flatMap((deg, k) => {
    const end = add(c, mul(dir(deg), arm));
    return [
      `${k ? "L" : "M"} ${pt(notch(deg - 45))}`,
      `L ${pt(add(end, mul(dir(deg - 90), w)))}`,
      `A ${w} ${w} 0 0 1 ${pt(add(end, mul(dir(deg + 90), w)))}`,
    ];
  });
  return [...parts, "Z"].join(" ");
}
