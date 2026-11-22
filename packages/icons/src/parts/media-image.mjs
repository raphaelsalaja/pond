import { poly } from "../../helpers.mjs";
import { at } from "./badge.mjs";
import dot from "./dot.mjs";
import { box, clip } from "./media-hole.mjs";

/** `image.mjs` open at the bottom right: the frame and the mountain both stop at the hole. */
export default (h, s, hole = at.hole) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  const peak = [6.5, 7.75];
  return [
    box([x0, y0, x1, y1], s.box, hole),
    poly([[x0, 11.25], peak, clip(peak, [12.75, y1], hole)], { radius: s.ease }),
    dot(h, s, 12, 7),
  ];
};
