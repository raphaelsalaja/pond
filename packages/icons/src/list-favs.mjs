import { left, line, right, rows } from "./parts/text-lines.mjs";

/** The heart is the set's heart scaled into the bottom right corner. */
export default ({ snap }) => {
  const R = 1.5;
  const k = R * Math.SQRT1_2;
  const cx = 12.625;
  const tip = right - 0.375;
  const tl = [snap(cx - 2 * k), 0];
  const drop = cx - tl[0];
  tl[1] = snap(tip - drop);
  const tr = [snap(2 * cx - tl[0]), tl[1]];
  const top = snap(tl[1] - 2 * k);
  return [
    line(rows[0], left, right),
    line(rows[1], left, 8.25),
    line(rows[2], left, 7),
    `M ${cx} ${tip} L ${tl.join(" ")} A ${R} ${R} 0 0 1 ${cx} ${top} A ${R} ${R} 0 0 1 ${tr.join(" ")} Z`,
  ];
};
