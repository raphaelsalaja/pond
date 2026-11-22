import { move, turn } from "./parts/objB-pose.mjs";

/** Drawn upright on x = 0, so the open pose can cross them about a point on both handles. */
const fork = (top, w, tine, tail) => {
  const r = w / 2;
  return [`M ${-r} ${top} V ${top + tine} A ${r} ${r} 0 0 0 ${r} ${top + tine} V ${top}`, `M 0 ${top} V ${tail}`];
};
const knife = (top, w, edge, tail) => {
  const k = edge - top;
  return `M 0 ${tail} V ${top} C ${w * 0.6} ${top + 0.08 * k} ${w} ${top + 0.35 * k} ${w} ${top + 0.7 * k} V ${edge - 1} A 1 1 0 0 1 ${w - 1} ${edge} H 0`;
};

export default () => [move(fork(2.375, 5, 2.25, 15.625), 5.375, 0), move(knife(2.625, 3.625, 10.25, 15.625), 11.75, 0)];

export const open = () => [turn(move(fork(-6.75, 4.5, 2.25, 6.5), 9, 9), -45), turn(move(knife(-6.75, 3, -1, 6.5), 9, 9), 45)];
