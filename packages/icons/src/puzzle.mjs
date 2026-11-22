import { turn } from "./parts/objC-turn.mjs";

/** Knobs are 1.75 circles on a 2.25 neck; the piece body is square. */
const piece = ({ pt }, s, deg) => {
  const [x0, y0, x1, y1] = [2.375, 5.625, 12.5, 15.625];
  const b = s.box;
  const knob = 1.75;
  const p = turn(
    [
      [x0 + b, y0],
      [6.25, y0],
      [8.5, y0],
      [x1 - b, y0],
      [x1, y0 + b],
      [x1, 9.5],
      [x1, 11.75],
      [x1, y1 - b],
      [x1 - b, y1],
      [x0 + b, y1],
      [x0, y1 - b],
      [x0, y0 + b],
    ],
    deg,
    1,
    [7.5, 10],
  ).map(pt);
  const corner = `A ${b} ${b} 0 0 1`;
  const bump = `A ${knob} ${knob} 0 1 1`;
  return `M ${p[0]} L ${p[1]} ${bump} ${p[2]} L ${p[3]} ${corner} ${p[4]} L ${p[5]} ${bump} ${p[6]} L ${p[7]} ${corner} ${p[8]} L ${p[9]} ${corner} ${p[10]} L ${p[11]} ${corner} ${p[0]} Z`;
};

export default (h, s) => piece(h, s, 0);

export const open = (h, s) => piece(h, s, -14);
