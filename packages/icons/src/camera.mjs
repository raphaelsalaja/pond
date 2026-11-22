import dot from "./parts/dot.mjs";
import camera, { body } from "./parts/media-camera.mjs";

export default (h, s) => {
  const [cx, cy] = body(s).lens;
  return [camera(s), h.circle(cx, cy, 2.25)];
};

/** The lens steps aside for the flash. */
export const open = (h, s) => {
  const [, cy] = body(s).lens;
  return [camera(s), h.circle(7.25, cy, 2), dot(h, s, 12.5, 8.5)];
};
