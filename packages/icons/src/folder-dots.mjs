import dot from "./parts/dot.mjs";
import folder, { body } from "./parts/folder.mjs";

export default (h, s) => {
  const { cx, cy } = body(s);
  return [folder(h, s), [cx - 3, cx, cx + 3].map((x) => dot(h, s, x, cy, 1))];
};
