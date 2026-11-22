import turn from "./parts/opens-turn.mjs";
import bell from "./bell.mjs";

export default (_, s) => {
  const [x0, y0, x1] = s.keylines.tall;
  const base = 12.625;
  const rr = (x1 - x0 - 1.5) / 2;
  const shoulder = y0 + 0.5 + rr;
  return [
    `M ${x0} ${base} L ${x0 + 0.75} ${base - 1.25} V ${shoulder} A ${rr} ${rr} 0 0 1 ${x1 - 0.75} ${shoulder} V ${base - 1.25} L ${x1} ${base} Z`,
    `M 7.5 ${base + 1.5} A 1.5 1.5 0 0 0 10.5 ${base + 1.5}`,
  ];
};

/** The bell swings about its centre, which keeps the clapper and flare inside the keyline. */
export const open = (h, s) => bell(h, s).map((d) => turn(d, 9, 9, 12));
