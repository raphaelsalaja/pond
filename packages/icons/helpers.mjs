/** Shape helpers every icon script draws with, on the 18 grid. */

const GRID = 18;
const STEP = 0.125;

export const snap = (v) => Math.round(v / STEP) * STEP;
const n = (v) => +snap(v).toFixed(3);
const pt = ([x, y]) => `${n(x)} ${n(y)}`;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => mul(a, 1 / len(a));

/** A corner's radius is at most a quarter of its shorter segment, halved under 60°, unless `corners` names it. */
export function poly(points, { closed = false, radius = 0, corners = {} } = {}) {
  const count = points.length;
  const at = (i) => points[(i + count) % count];
  const fillet = (i) => {
    const named = corners[i] !== undefined;
    const r0 = named ? corners[i] : radius;
    if (!r0) return null;
    const a = at(i - 1);
    const b = at(i);
    const c = at(i + 1);
    const u = unit(sub(a, b));
    const v = unit(sub(c, b));
    const angle = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])));
    if (angle > Math.PI - 1e-3) return null;
    const la = len(sub(a, b));
    const lc = len(sub(c, b));
    let r = named ? r0 : Math.min(r0, Math.min(la, lc) / 4);
    if (!named && angle < Math.PI / 3) r /= 2;
    /** An open line's end segment has no corner at its far end, so its whole length can round this one. */
    const free = (j) => !closed && (j === 0 || j === count - 1);
    const t = Math.min(r / Math.tan(angle / 2), free(i - 1) ? la : la / 2, free(i + 1) ? lc : lc / 2);
    r = t * Math.tan(angle / 2);
    const d1 = sub(b, a);
    const d2 = sub(c, b);
    const sweep = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : 0;
    return { from: add(b, mul(u, t)), to: add(b, mul(v, t)), r, sweep };
  };
  const visit = (i) => {
    const f = fillet(i);
    return f ? `L ${pt(f.from)} A ${n(f.r)} ${n(f.r)} 0 0 ${f.sweep} ${pt(f.to)}` : `L ${pt(at(i))}`;
  };
  if (!closed) {
    const mid = points.slice(1, -1).map((_, k) => visit(k + 1));
    return [`M ${pt(points[0])}`, ...mid, `L ${pt(points[count - 1])}`].join(" ");
  }
  const first = fillet(0);
  const start = first ? first.to : points[0];
  const rest = points.slice(1).map((_, k) => visit(k + 1));
  const close = first ? [`L ${pt(first.from)} A ${n(first.r)} ${n(first.r)} 0 0 ${first.sweep} ${pt(first.to)}`] : [];
  return [`M ${pt(start)}`, ...rest, ...close, "Z"].join(" ");
}

export const rect = (x, y, w, h, radius) =>
  poly(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    { closed: true, radius },
  );

export const circle = (cx, cy, r) =>
  `M ${pt([cx - r, cy])} A ${n(r)} ${n(r)} 0 1 0 ${pt([cx + r, cy])} A ${n(r)} ${n(r)} 0 1 0 ${pt([cx - r, cy])} Z`;

/** Degrees from the right, clockwise on screen. */
export function arc(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${pt(p(a0))} A ${n(r)} ${n(r)} 0 ${large} ${a1 > a0 ? 1 : 0} ${pt(p(a1))}`;
}

export function starPoints(cx, cy, outer, inner, count = 5) {
  return Array.from({ length: count * 2 }, (_, i) => {
    const a = ((-90 + (i * 180) / count) * Math.PI) / 180;
    const r = i % 2 ? inner : outer;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
}

export const helpers = { poly, rect, circle, arc, starPoints, snap, pt };

/** Flattens `style.json` to one size's values, the shape every script reads. */
export const values = (style, size = GRID) => ({ ...style, ...style.sizes[size] });

/** Parts are path data (stroked) or `{ d, fill, solid, width }`. */
export function draw(script, style) {
  const parts = [script(helpers, style)].flat(Infinity).filter(Boolean);
  const body = parts
    .map((p) => {
      const part = typeof p === "string" ? { d: p } : p;
      if (part.solid) return `<path d="${part.d}" fill="currentColor" stroke="none"/>`;
      return `<path d="${part.d}"${part.fill ? ` fill="currentColor"` : ""}${part.width ? ` stroke-width="${part.width}"` : ""}/>`;
    })
    .join("")
    .replace(/-?\d+\.\d{4,}/g, (m) => String(+(+m).toFixed(3)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" fill="none" stroke="currentColor" stroke-width="${style.stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
