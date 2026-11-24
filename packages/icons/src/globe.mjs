import turn from "./parts/opens-turn.mjs";
import ring from "./parts/ring.mjs";

const globe = (h, s) => {
  const [cx, cy, r] = s.keylines.circle;
  const rx = 3.25;
  return [
    ring(h, s),
    `M ${cx} ${cy - r} A ${rx} ${r} 0 0 1 ${cx} ${cy + r} A ${rx} ${r} 0 0 1 ${cx} ${cy - r}`,
    `M ${cx - r} ${cy} H ${cx + r}`,
  ];
};

export default globe;

/** The globe tilts on its axis; the ring stays put. */
export const open = (h, s) => {
  const [rim, ...lines] = globe(h, s);
  return [rim, lines.map((d) => turn(d, 9, 9, -20))];
};
