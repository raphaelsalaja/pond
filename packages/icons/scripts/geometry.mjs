/** Path geometry for the part and base checks in build.mjs. */

const TOKEN = /[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

const num = (value) => Number.parseFloat(value ?? "0");

function arcCenter([x1, y1], [x2, y2], rx, ry, phi, large, sweep) {
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const px = cos * dx + sin * dy;
  const py = -sin * dx + cos * dy;
  let rxa = Math.abs(rx);
  let rya = Math.abs(ry);
  const scale = (px * px) / (rxa * rxa) + (py * py) / (rya * rya);
  if (scale > 1) {
    rxa *= Math.sqrt(scale);
    rya *= Math.sqrt(scale);
  }
  const numerator =
    rxa * rxa * rya * rya - rxa * rxa * py * py - rya * rya * px * px;
  const denominator = rxa * rxa * py * py + rya * rya * px * px;
  const factor =
    (large === sweep ? -1 : 1) *
    Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rxa * py) / rya;
  const cyp = (-factor * rya * px) / rxa;
  const angle = (ux, uy, vx, vy) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (px - cxp) / rxa, (py - cyp) / rya);
  let delta = angle(
    (px - cxp) / rxa,
    (py - cyp) / rya,
    (-px - cxp) / rxa,
    (-py - cyp) / rya,
  );
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  return {
    cx: cos * cxp - sin * cyp + (x1 + x2) / 2,
    cy: sin * cxp + cos * cyp + (y1 + y2) / 2,
    rx: rxa,
    ry: rya,
    phi,
    start,
    delta,
  };
}

function pathSegments(d) {
  const tokens = d.match(TOKEN) ?? [];
  const out = [];
  let i = 0;
  let command = "";
  let point = [0, 0];
  let start = [0, 0];
  let control = null;
  let move = true;
  while (i < tokens.length) {
    if (/[a-z]/i.test(tokens[i])) command = tokens[i++];
    const upper = command.toUpperCase();
    const relative = command !== upper;
    const args = tokens.slice(i, i + ARITY[upper]).map(Number);
    i += ARITY[upper];
    const at = (x, y) => (relative ? [point[0] + x, point[1] + y] : [x, y]);
    if (upper === "M") {
      point = at(args[0], args[1]);
      start = point;
      move = true;
      control = null;
      command = relative ? "l" : "L";
      continue;
    }
    if (upper === "Z") {
      if (point[0] !== start[0] || point[1] !== start[1]) {
        out.push({ kind: "line", from: point, to: start, move });
      }
      point = start;
      move = true;
      control = null;
      continue;
    }
    let segment;
    if (upper === "L" || upper === "H" || upper === "V" || upper === "T") {
      const to =
        upper === "H"
          ? [relative ? point[0] + args[0] : args[0], point[1]]
          : upper === "V"
            ? [point[0], relative ? point[1] + args[0] : args[0]]
            : at(args[0], args[1]);
      segment = { kind: "line", from: point, to };
      control = null;
    } else if (upper === "C" || upper === "S") {
      const c1 =
        upper === "S"
          ? control
            ? [2 * point[0] - control[0], 2 * point[1] - control[1]]
            : point
          : at(args[0], args[1]);
      const c2 = upper === "S" ? at(args[0], args[1]) : at(args[2], args[3]);
      const to = upper === "S" ? at(args[2], args[3]) : at(args[4], args[5]);
      segment = { kind: "cubic", from: point, c1, c2, to };
      control = c2;
    } else if (upper === "Q") {
      const q = at(args[0], args[1]);
      const to = at(args[2], args[3]);
      const toward = (p) => [
        p[0] + (2 / 3) * (q[0] - p[0]),
        p[1] + (2 / 3) * (q[1] - p[1]),
      ];
      segment = {
        kind: "cubic",
        from: point,
        c1: toward(point),
        c2: toward(to),
        to,
      };
      control = null;
    } else {
      const to = at(args[5], args[6]);
      const phi = (args[2] * Math.PI) / 180;
      segment = {
        kind: "arc",
        from: point,
        to,
        flags: [args[0], args[1], args[2]],
        ...arcCenter(point, to, args[0], args[1], phi, args[3], args[4]),
      };
      control = null;
    }
    segment.move = move;
    move = false;
    out.push(segment);
    point = segment.to;
  }
  return out;
}

function roundRect(attrs) {
  const x = num(attrs.x);
  const y = num(attrs.y);
  const w = num(attrs.width);
  const h = num(attrs.height);
  const r = Math.min(num(attrs.rx ?? attrs.ry), w / 2, h / 2);
  if (!r) {
    return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
  }
  return [
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
  ].join("");
}

/** Every shape as one path, so circles and rects compare with paths. */
function toPath(tag, attrs) {
  if (tag === "path") return attrs.d;
  if (tag === "rect") return roundRect(attrs);
  const cx = num(attrs.cx);
  const cy = num(attrs.cy);
  const r = num(attrs.r);
  return `M${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}Z`;
}

export const segments = (tag, attrs) => pathSegments(toPath(tag, attrs));

function pointAt(segment, t) {
  if (segment.kind === "line") {
    const [a, b] = [segment.from, segment.to];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  if (segment.kind === "cubic") {
    const u = 1 - t;
    const { from: p0, c1, c2, to: p3 } = segment;
    return [0, 1].map(
      (k) =>
        u * u * u * p0[k] +
        3 * u * u * t * c1[k] +
        3 * u * t * t * c2[k] +
        t * t * t * p3[k],
    );
  }
  const angle = segment.start + segment.delta * t;
  const cos = Math.cos(segment.phi);
  const sin = Math.sin(segment.phi);
  const x = segment.rx * Math.cos(angle);
  const y = segment.ry * Math.sin(angle);
  return [segment.cx + cos * x - sin * y, segment.cy + sin * x + cos * y];
}

/** Points along each segment no further apart than `step`. */
export function flatten(list, step = 0.05) {
  const points = [];
  for (const segment of list) {
    const length = Math.hypot(
      segment.to[0] - segment.from[0],
      segment.to[1] - segment.from[1],
    );
    const span =
      segment.kind === "arc"
        ? Math.abs(segment.delta) * Math.max(segment.rx, segment.ry)
        : segment.kind === "cubic"
          ? length * 1.6
          : length;
    const count = Math.max(1, Math.ceil(span / step));
    for (let i = 0; i <= count; i++) points.push(pointAt(segment, i / count));
  }
  return points;
}
