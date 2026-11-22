import { poly } from "../../helpers.mjs";

/** Drawn as align-left (or centred on a vertical line), then turned to each side. */
const thick = 3.5;
const gap = 3.25;
const long = 10.5;
const short = 6.5;
const corner = 1.25;

const turns = {
  left: (p) => p,
  right: ([x, y]) => [18 - x, y],
  top: ([x, y]) => [y, x],
  bottom: ([x, y]) => [y, 18 - x],
  horizontal: (p) => p,
  vertical: ([x, y]) => [y, x],
};

export default (s, side) => {
  const [x0, y0, , y1] = s.keylines.square;
  const map = turns[side];
  const centred = side === "horizontal" || side === "vertical";
  const top = 9 - thick - gap / 2;
  const low = top + thick + gap;
  const bar = (x, y, w) =>
    poly(
      [
        [x, y],
        [x + w, y],
        [x + w, y + thick],
        [x, y + thick],
      ].map(map),
      { closed: true, corners: { 0: corner, 1: corner, 2: corner, 3: corner } },
    );
  const line = (a, b) => {
    const [p, q] = [map([centred ? 9 : x0, a]), map([centred ? 9 : x0, b])];
    return `M ${p[0]} ${p[1]} L ${q[0]} ${q[1]}`;
  };
  if (centred) {
    return [
      bar(9 - long / 2, top, long),
      bar(9 - short / 2, low, short),
      line(y0, top),
      line(top + thick, low),
      line(low + thick, y1),
    ];
  }
  const start = x0 + 2.75;
  return [line(y0, y1), bar(start, top, long), bar(start, low, short)];
};
