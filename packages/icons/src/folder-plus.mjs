import folder, { body } from "./parts/folder.mjs";
import plus from "./parts/plus.mjs";

export default (h, s) => {
  const { cx, cy } = body(s);
  return [folder(h, s), plus(cx, cy, 2.25)];
};
