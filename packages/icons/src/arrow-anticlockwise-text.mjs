import { head } from "./parts/arrows-head.mjs";

export default (h, s) => {
  const [x0, y0, x1] = s.keylines.square;
  const [mid, low] = [7.875, 13.125];
  const r = (low - mid) / 2;
  const cx = x1 - r;
  const tip = 8.5;
  return [
    `M ${x0} ${y0} H ${x1}`,
    `M ${x0} ${mid} H ${cx} A ${r} ${r} 0 0 1 ${cx} ${low} H ${tip}`,
    head(s, [tip, low], [-1, 0], 2.5),
    `M ${x0} ${low} H 5.25`,
  ];
};
