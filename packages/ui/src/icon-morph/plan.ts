import type { IconComponent, IconNode } from "@pond/icons/types";

type Attrs = Readonly<Record<string, string>>;
type Point = readonly [number, number];

interface Contour {
  points: Array<Point>;
  closed: boolean;
  /** Non-geometry attributes, such as a solid dot's fill. */
  paint: Attrs;
}

export interface Track {
  id: string;
  from: Array<Point>;
  to: Array<Point>;
  closed: boolean;
  paint: Attrs;
}

export interface Fade {
  id: string;
  d: string;
  paint: Attrs;
}

export interface MorphPlan {
  still: IconNode;
  tracks: Array<Track>;
  leaving: Array<Fade>;
  entering: Array<Fade>;
}

interface Pair {
  i: number;
  j: number;
  from: Array<Point>;
  to: Array<Point>;
  cost: number;
}

const SAMPLES = 48;
const SVG_NS = "http://www.w3.org/2000/svg";
const GEOMETRY = new Set([
  "d",
  "x",
  "y",
  "width",
  "height",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
]);

let probe: SVGPathElement | null = null;

/** Detached paths can't be measured in every engine, so the probe lives in a hidden svg. */
function measure(d: string): SVGPathElement | null {
  if (!probe) {
    const doc = globalThis.document;
    if (!doc?.body) return null;
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText =
      "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    probe = doc.createElementNS(SVG_NS, "path");
    svg.append(probe);
    doc.body.append(svg);
  }
  if (!("getTotalLength" in probe)) return null;
  probe.setAttribute("d", d);
  return probe;
}

function num(attrs: Attrs, key: string, fallback = 0) {
  const value = Number(attrs[key]);
  return Number.isFinite(value) ? value : fallback;
}

function toPath(tag: string, attrs: Attrs): string | null {
  if (tag === "path") return attrs.d ?? null;
  if (tag === "circle") {
    const [cx, cy, r] = [num(attrs, "cx"), num(attrs, "cy"), num(attrs, "r")];
    return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
  }
  if (tag === "rect") {
    const [x, y, w, h] = [
      num(attrs, "x"),
      num(attrs, "y"),
      num(attrs, "width"),
      num(attrs, "height"),
    ];
    const r = Math.min(num(attrs, "rx", num(attrs, "ry")), w / 2, h / 2);
    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
  }
  return null;
}

/** Splits a path into subpaths, each starting with an absolute move, so a morph never draws a line between them. */
function subpaths(d: string): Array<string> {
  const parts = d.split(/(?=[Mm])/).filter((part) => part.trim());
  const out: Array<string> = [];
  let sofar = "";
  for (const part of parts) {
    let piece = part;
    if (part.trimStart().startsWith("m") && sofar) {
      const path = measure(sofar);
      if (path) {
        const end = path.getPointAtLength(path.getTotalLength());
        piece = part.replace(
          /^\s*m\s*(-?[\d.]+)[\s,]*(-?[\d.]+)/,
          (_, dx, dy) => `M${end.x + Number(dx)} ${end.y + Number(dy)}`,
        );
      }
    }
    sofar += piece;
    out.push(piece);
  }
  return out;
}

/** Rings end on their start point too, so a ring morphing into an open line stays closed without a `Z`. */
function sample(d: string): Array<Point> | null {
  const path = measure(d);
  if (!path) return null;
  const length = path.getTotalLength();
  const points: Array<Point> = [];
  for (let index = 0; index < SAMPLES; index += 1) {
    const point = path.getPointAtLength((length * index) / (SAMPLES - 1));
    points.push([point.x, point.y]);
  }
  return points;
}

function contoursOf(nodes: IconNode): Array<Contour> | null {
  const contours: Array<Contour> = [];
  for (const [tag, attrs] of nodes) {
    const d = toPath(tag, attrs);
    if (!d) return null;
    const paint = Object.fromEntries(
      Object.entries(attrs).filter(([key]) => !GEOMETRY.has(key)),
    );
    for (const sub of subpaths(d)) {
      const closed = /z\s*$/i.test(sub.trim());
      const points = sample(sub);
      if (!points) return null;
      contours.push({ points, closed, paint });
    }
  }
  return contours;
}

function cost(a: Array<Point>, b: Array<Point>) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    const p = a[index];
    const q = b[index];
    if (p && q) total += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
  }
  return total;
}

/** Every start point and direction around a ring, each ending back on its start. */
function rotations(points: Array<Point>): Array<Array<Point>> {
  const out: Array<Array<Point>> = [];
  for (const ring of [points.slice(0, -1), points.slice(0, -1).reverse()]) {
    for (let shift = 0; shift < ring.length; shift += 1) {
      const rotated = [...ring.slice(shift), ...ring.slice(0, shift)];
      const start = rotated[0];
      if (start) out.push([...rotated, start]);
    }
  }
  return out;
}

/** Picks the start point and direction on the ring side so each point travels the shortest way. */
function align(from: Contour, to: Contour): [Array<Point>, Array<Point>] {
  const pairs: Array<[Array<Point>, Array<Point>]> = to.closed
    ? rotations(to.points).map((points) => [from.points, points])
    : from.closed
      ? rotations(from.points).map((points) => [points, to.points])
      : [
          [from.points, to.points],
          [from.points, [...to.points].reverse()],
        ];
  let best = pairs[0] ?? [from.points, to.points];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const pair of pairs) {
    const value = cost(...pair);
    if (value < bestCost) {
      bestCost = value;
      best = pair;
    }
  }
  return best;
}

export function polyline(points: ReadonlyArray<Point>, closed: boolean) {
  const body = points
    .map(
      ([x, y], index) => `${index ? "L" : "M"}${x.toFixed(3)} ${y.toFixed(3)}`,
    )
    .join("");
  return closed ? `${body}Z` : body;
}

const plans = new Map<string, MorphPlan | null>();

function sig([tag, attrs]: IconNode[number]) {
  return `${tag}${JSON.stringify(attrs)}`;
}

function fades(contours: Array<Contour>, taken: Set<number>, side: string) {
  return contours.flatMap((contour, index): Array<Fade> =>
    taken.has(index)
      ? []
      : [
          {
            id: `${side}${index}`,
            d: polyline(contour.points, contour.closed),
            paint: contour.paint,
          },
        ],
  );
}

/** Unchanged contours hold still, changed ones travel point by point, and leftovers fade in place. */
export function planMorph(
  from: IconComponent,
  to: IconComponent,
): MorphPlan | null {
  const a = from.glyph;
  const b = to.glyph;
  if (!a || !b || a.style !== b.style) return null;
  const key = `${from.displayName}>${to.displayName}`;
  const cached = plans.get(key);
  if (cached !== undefined) return cached;

  const toSigs = b.nodes.map(sig);
  const used = new Set<number>();
  const still: Array<IconNode[number]> = [];
  const moving: Array<IconNode[number]> = [];
  for (const node of a.nodes) {
    const match = toSigs.findIndex(
      (value, index) => value === sig(node) && !used.has(index),
    );
    if (match >= 0) {
      used.add(match);
      still.push(node);
    } else {
      moving.push(node);
    }
  }
  const arriving = b.nodes.filter((_, index) => !used.has(index));

  const source = contoursOf(moving);
  const target = contoursOf(arriving);
  if (!source || !target) {
    plans.set(key, null);
    return null;
  }

  const pairs: Array<Pair> = [];
  source.forEach((s, i) => {
    target.forEach((t, j) => {
      const [from, to] = align(s, t);
      pairs.push({ i, j, from, to, cost: Math.sqrt(cost(from, to) / SAMPLES) });
    });
  });
  pairs.sort((x, y) => x.cost - y.cost);
  const takenFrom = new Set<number>();
  const takenTo = new Set<number>();
  const tracks: Array<Track> = [];
  for (const { i, j, from, to } of pairs) {
    const s = source[i];
    const t = target[j];
    if (!s || !t || takenFrom.has(i) || takenTo.has(j)) continue;
    takenFrom.add(i);
    takenTo.add(j);
    tracks.push({
      id: `${i}>${j}`,
      from,
      to,
      closed: s.closed && t.closed,
      paint: t.paint,
    });
  }
  const plan: MorphPlan = {
    still,
    tracks,
    leaving: fades(source, takenFrom, "from"),
    entering: fades(target, takenTo, "to"),
  };
  plans.set(key, plan);
  return plan;
}
