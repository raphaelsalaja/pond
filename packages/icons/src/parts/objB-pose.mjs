import { snap } from "../../helpers.mjs";

/** Maps every point of absolute M L H V C A Z path data; a mirroring map passes `flip` so arcs keep their bulge. */
function remap(d, fn, flip = false) {
  const tokens = d.match(/[MLHVCAZ]|-?\d*\.?\d+/g);
  const out = [];
  let cur = [0, 0];
  let i = 0;
  const num = () => +tokens[i++];
  const put = (p) => fn(p).map(snap).join(" ");
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "Z") out.push("Z");
    else if (cmd === "M" || cmd === "L") {
      cur = [num(), num()];
      out.push(`${cmd} ${put(cur)}`);
    } else if (cmd === "H" || cmd === "V") {
      cur = cmd === "H" ? [num(), cur[1]] : [cur[0], num()];
      out.push(`L ${put(cur)}`);
    } else if (cmd === "C") {
      const pts = [
        [num(), num()],
        [num(), num()],
        [num(), num()],
      ];
      cur = pts[2];
      out.push(`C ${pts.map(put).join(" ")}`);
    } else if (cmd === "A") {
      const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()];
      cur = [num(), num()];
      out.push(
        `A ${rx} ${ry} ${rot} ${large} ${flip ? 1 - sweep : sweep} ${put(cur)}`,
      );
    }
  }
  return out.join(" ");
}

const each = (parts, fn) =>
  [parts]
    .flat(Infinity)
    .filter(Boolean)
    .map((p) => (p.d === undefined ? fn(p) : { ...p, d: fn(p.d) }));

/** Turns parts by `deg` clockwise on screen around (cx, cy). */
export const turn = (parts, deg, cx = 9, cy = 9) => {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return each(parts, (d) =>
    remap(d, ([x, y]) => [
      cx + (x - cx) * c - (y - cy) * s,
      cy + (x - cx) * s + (y - cy) * c,
    ]),
  );
};

export const move = (parts, dx, dy) =>
  each(parts, (d) => remap(d, ([x, y]) => [x + dx, y + dy]));

/** Mirrors parts top to bottom across y = 9. */
export const flipY = (parts) =>
  each(parts, (d) => remap(d, ([x, y]) => [x, 18 - y], true));
