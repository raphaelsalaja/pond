import { snap } from "../../helpers.mjs";

/** Rotates absolute M/L/H/V/A/Z path data about (cx, cy), clockwise on screen, snapping ends to the grid. */
export default (d, cx, cy, deg) => {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const p = (x, y) => [snap(cx + (x - cx) * c - (y - cy) * s), snap(cy + (x - cx) * s + (y - cy) * c)];
  const t = d.match(/[MLHVAZ]|-?\d*\.?\d+/g);
  const num = () => +t[i++];
  const out = [];
  let [i, x, y] = [0, 0, 0];
  while (i < t.length) {
    const cmd = t[i++];
    if (cmd === "Z") out.push("Z");
    else if (cmd === "M" || cmd === "L") {
      [x, y] = [num(), num()];
      out.push(cmd, ...p(x, y));
    } else if (cmd === "H") {
      x = num();
      out.push("L", ...p(x, y));
    } else if (cmd === "V") {
      y = num();
      out.push("L", ...p(x, y));
    } else if (cmd === "A") {
      const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()];
      [x, y] = [num(), num()];
      out.push("A", rx, ry, rot + deg, large, sweep, ...p(x, y));
    }
  }
  return out.join(" ");
};
