import { poly, snap } from "../../helpers.mjs";
import { at, edge } from "./badge.mjs";

/** A box as an open path from its bottom edge round to its right edge, both stopping at the badge hole. */
export const box = ([x0, y0, x1, y1], radius, hole = at.hole) =>
  poly(
    [
      [edge(y1, hole), y1],
      [x0, y1],
      [x0, y0],
      [x1, y0],
      [x1, edge(x1, hole)],
    ],
    { corners: { 1: radius, 2: radius, 3: radius } },
  );

/** Where a segment from `a` towards `b` first meets the hole, snapped to the grid. */
export const clip = (a, b, hole = at.hole) => {
  const d = [b[0] - a[0], b[1] - a[1]];
  const f = [a[0] - at.cx, a[1] - at.cy];
  const qa = d[0] * d[0] + d[1] * d[1];
  const qb = 2 * (f[0] * d[0] + f[1] * d[1]);
  const qc = f[0] * f[0] + f[1] * f[1] - hole * hole;
  const t = (-qb - Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
  return [snap(a[0] + d[0] * t), snap(a[1] + d[1] * t)];
};
