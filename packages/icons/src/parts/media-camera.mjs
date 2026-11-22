import { poly } from "../../helpers.mjs";
import { at, edge } from "./badge.mjs";

/** The camera body with its viewfinder hump; `lens` is the centre of the body below the top edge. */
export const body = (s) => {
  const [x0, , x1] = s.keylines.wide;
  return { x0, x1, top: 5, bottom: 15, hump: 3, lens: [9, 10] };
};

const outline = (s) => {
  const { x0, x1, top, bottom, hump } = body(s);
  return [
    [x0, bottom],
    [x0, top],
    [5.25, top],
    [7, hump],
    [11, hump],
    [12.75, top],
    [x1, top],
    [x1, bottom],
  ];
};

const turns = (s, shift = 0) => ({ [1 + shift]: s.box, [2 + shift]: s.ease, [3 + shift]: s.ease, [4 + shift]: s.ease, [5 + shift]: s.ease, [6 + shift]: s.box });

export default (s) => {
  const points = outline(s);
  return poly(points, { closed: true, corners: { 0: s.box, ...turns(s), 7: s.box } });
};

/** The body open at the bottom right, stopping at a hole round the badge spot. */
export const open = (s, hole = at.hole) => {
  const points = outline(s);
  const { x1, bottom } = body(s);
  return poly([[edge(bottom, hole), bottom], ...points.slice(0, 7), [x1, edge(x1, hole)]], { corners: { 1: s.box, ...turns(s, 1) } });
};
