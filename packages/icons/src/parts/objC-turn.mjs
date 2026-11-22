import { snap } from "../../helpers.mjs";

/** Rotates points clockwise on screen by `deg` and scales by `k` about a centre, snapped to the grid. */
export const turn = (points, deg, k = 1, [cx, cy] = [9, 9]) => {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return points.map(([x, y]) => {
    const [dx, dy] = [(x - cx) * k, (y - cy) * k];
    return [snap(cx + dx * c - dy * s), snap(cy + dx * s + dy * c)];
  });
};
