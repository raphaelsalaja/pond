import { rect } from "../../helpers.mjs";
import { box } from "./media-hole.mjs";

/** A window on the square or wide keyline: `bar` is its title bar line, `side` its sidebar line. */
export const frame = (s, key = "wide") => {
  const [x0, y0, x1, y1] = s.keylines[key];
  return { x0, y0, x1, y1, bar: y0 + 3.5, side: x0 + 4.25 };
};

/** A table: the title bar is its header, the sidebar its key column, plus one row rule. */
export const table = (s) => {
  const f = frame(s);
  return { ...f, row: (f.bar + f.y1) / 2 };
};

/** The window open at the bottom right, where a badge sits. */
export const open = (s, key = "wide") => box(s.keylines[key], s.box);

export default (s, key = "wide") => {
  const { x0, y0, x1, y1 } = frame(s, key);
  return rect(x0, y0, x1 - x0, y1 - y0, s.box);
};
