import { snap } from "../../helpers.mjs";
import { at } from "./badge.mjs";

const TAU = Math.PI * 2;
const n = (v) => +snap(v).toFixed(3);
const pt = ([x, y]) => `${n(x)} ${n(y)}`;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const unit = (a) => mul(a, 1 / len(a));
const mod = (v) => ((v % TAU) + TAU) % TAU;

export const line = (a, b) => ({ kind: "line", a, b });

/** An elliptical arc in screen angles; a positive turn runs clockwise on screen. */
export const arc = (c, rx, ry, t0, turn) => ({
  kind: "arc",
  c,
  rx,
  ry,
  t0,
  turn,
});

export const ring = (cx, cy, r) => arc([cx, cy], r, r, Math.PI, TAU);

export const cubic = (a, b, c, d) => ({ kind: "cubic", p: [a, b, c, d] });

const lerp = (a, b, u) => add(a, mul(sub(b, a), u));
const split = ([a, b, c, d], u) => {
  const [ab, bc, cd] = [lerp(a, b, u), lerp(b, c, u), lerp(c, d, u)];
  const [abc, bcd] = [lerp(ab, bc, u), lerp(bc, cd, u)];
  const m = lerp(abc, bcd, u);
  return [
    [a, ab, abc, m],
    [m, bcd, cd, d],
  ];
};

const point = (seg, u) =>
  seg.kind === "line"
    ? add(seg.a, mul(sub(seg.b, seg.a), u))
    : seg.kind === "cubic"
      ? split(seg.p, u)[0][3]
      : [
          seg.c[0] + seg.rx * Math.cos(seg.t0 + seg.turn * u),
          seg.c[1] + seg.ry * Math.sin(seg.t0 + seg.turn * u),
        ];

/** The lines and arcs `poly` would draw for the same points and options. */
export function outline(
  points,
  { closed = false, radius = 0, corners = {} } = {},
) {
  const count = points.length;
  const at = (i) => points[(i + count) % count];
  const fillet = (i) => {
    const named = corners[i] !== undefined;
    const r0 = named ? corners[i] : radius;
    if (!r0) return null;
    const [a, b, c] = [at(i - 1), at(i), at(i + 1)];
    const u = unit(sub(a, b));
    const v = unit(sub(c, b));
    const angle = Math.acos(
      Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])),
    );
    if (angle > Math.PI - 1e-3) return null;
    const la = len(sub(a, b));
    const lc = len(sub(c, b));
    let r = named ? r0 : Math.min(r0, Math.min(la, lc) / 4);
    if (!named && angle < Math.PI / 3) r /= 2;
    const t = Math.min(r / Math.tan(angle / 2), la / 2, lc / 2);
    r = t * Math.tan(angle / 2);
    const from = add(b, mul(u, t));
    const to = add(b, mul(v, t));
    const centre = add(b, mul(unit(add(u, v)), r / Math.sin(angle / 2)));
    const d1 = sub(b, a);
    const d2 = sub(c, b);
    const cw = d1[0] * d2[1] - d1[1] * d2[0] > 0;
    const t0 = Math.atan2(from[1] - centre[1], from[0] - centre[0]);
    const t1 = Math.atan2(to[1] - centre[1], to[0] - centre[0]);
    const turn = cw ? mod(t1 - t0) : -mod(t0 - t1);
    return { from, to, seg: arc(centre, r, r, t0, turn) };
  };
  const segs = [];
  let cursor = null;
  const lineTo = (p) => {
    if (cursor && len(sub(p, cursor)) > 1e-6) segs.push(line(cursor, p));
    cursor = p;
  };
  const indices = closed ? [...points.keys(), 0] : [...points.keys()];
  for (const [k, i] of indices.entries()) {
    const edge = !closed && (k === 0 || k === indices.length - 1);
    const f = edge ? null : fillet(i);
    if (!f) {
      lineTo(points[i]);
      continue;
    }
    lineTo(f.from);
    if (closed && k === indices.length - 1) continue;
    segs.push(f.seg);
    cursor = f.to;
  }
  return segs;
}

export const hole =
  (cx = at.cx, cy = at.cy, r = at.hole) =>
  (p) =>
    Math.hypot(p[0] - cx, p[1] - cy) < r;

/** Points closer than `w` to the infinite line through `a` and `b`. */
export const band = (a, b, w) => {
  const d = unit(sub(b, a));
  return (p) => Math.abs((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) < w;
};

/** Points closer than `w` to the segment from `a` to `b`. */
export const near = (a, b, w) => {
  const d = sub(b, a);
  const l2 = d[0] * d[0] + d[1] * d[1];
  return (p) => {
    const t = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / l2),
    );
    return len(sub(p, add(a, mul(d, t)))) < w;
  };
};

const pieces = (seg, inside) => {
  const steps = 400;
  const out = [];
  const edge = (lo, hi, startIn) => {
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (inside(point(seg, mid)) === startIn) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  let prev = inside(point(seg, 0));
  let start = prev ? null : 0;
  for (let k = 1; k <= steps; k++) {
    const u = k / steps;
    const now = inside(point(seg, u));
    if (now !== prev) {
      const e = edge((k - 1) / steps, u, prev);
      if (now) out.push([start, e]);
      else start = e;
      prev = now;
    }
  }
  if (!prev) {
    out.push([start, 1]);
  }
  return out.flatMap(([u0, u1]) => (u1 - u0 > 1e-6 ? [{ seg, u0, u1 }] : []));
};

const emit = (p) => {
  const end = point(p.seg, p.u1);
  if (p.seg.kind === "line") return [`L ${pt(end)}`];
  if (p.seg.kind === "cubic") {
    const tail = split(p.seg.p, p.u0)[1];
    const [, b, c, d] = split(tail, (p.u1 - p.u0) / (1 - p.u0 || 1))[0];
    return [`C ${pt(b)} ${pt(c)} ${pt(d)}`];
  }
  const turn = p.seg.turn * (p.u1 - p.u0);
  const cmd = (q, t) =>
    `A ${n(p.seg.rx)} ${n(p.seg.ry)} 0 ${Math.abs(t) > Math.PI ? 1 : 0} ${t > 0 ? 1 : 0} ${pt(q)}`;
  if (Math.abs(turn) < Math.PI * 1.5) return [cmd(end, turn)];
  const mid = point(p.seg, (p.u0 + p.u1) / 2);
  return [cmd(mid, turn / 2), cmd(end, turn / 2)];
};

/** Drops every part of the outline that falls inside any of `holes`, keeping the rest as open paths. */
export function cut(segs, holes = [hole()], { closed = true } = {}) {
  const inside = (p) => holes.some((h) => h(p));
  let kept = segs.flatMap((seg) => pieces(seg, inside));
  const whole =
    kept.length === segs.length && kept.every((p) => p.u0 === 0 && p.u1 === 1);
  if (closed && !whole && kept.length > 1) {
    const first = kept[0];
    const last = kept.at(-1);
    if (
      first.seg === segs[0] &&
      first.u0 === 0 &&
      last.seg === segs.at(-1) &&
      last.u1 === 1
    ) {
      let k = kept.length - 1;
      while (
        k > 0 &&
        kept[k - 1].u1 === 1 &&
        kept[k].u0 === 0 &&
        segs.indexOf(kept[k - 1].seg) === segs.indexOf(kept[k].seg) - 1
      ) {
        k--;
      }
      kept = [...kept.slice(k), ...kept.slice(0, k)];
    }
  }
  const out = [];
  let cursor = null;
  for (const p of kept) {
    const start = point(p.seg, p.u0);
    if (!cursor || len(sub(start, cursor)) > 1e-6) out.push(`M ${pt(start)}`);
    out.push(...emit(p));
    cursor = point(p.seg, p.u1);
  }
  return out.join(" ") + (closed && whole ? " Z" : "");
}
