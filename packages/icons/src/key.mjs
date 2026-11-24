import { flipY } from "./parts/objB-pose.mjs";

/** Bow bottom left, the shaft on the 45° diagonal with two teeth hanging off it. */
const key = ({ circle, snap }) => {
  const c = [5.75, 12.25];
  const r = 3.375;
  const k = Math.SQRT1_2;
  const along = (d) => [c[0] + d * k, c[1] - d * k];
  const p = (q) => q.map(snap).join(" ");
  const tooth = (d, len) => {
    const a = along(d);
    return `M ${p(a)} L ${p([a[0] + len * k, a[1] + len * k])}`;
  };
  return [
    circle(...c, r),
    `M ${p(along(r))} L ${p(along(12.75))}`,
    tooth(11.75, 1.75),
    tooth(9, 1.5),
  ];
};

export default key;

export const open = (h, s) => flipY(key(h, s));
