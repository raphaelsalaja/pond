/** A sheet curled at both ends, from a 20 × 18 drawing scaled onto the square keyline. */
const scroll = ({ snap }) => {
  const k = 13.25 / 20;
  const p = (x, y) => `${snap(2.375 + (x - 2) * k)} ${snap(3.125 + (y - 3) * k)}`;
  const r = snap(2 * k);
  return [
    `M ${p(8, 21)} L ${p(20, 21)} A ${r} ${r} 0 0 0 ${p(22, 19)} L ${p(22, 17)} L ${p(10, 17)} L ${p(10, 19)} A ${r} ${r} 0 1 1 ${p(6, 19)} L ${p(6, 5)} A ${r} ${r} 0 1 0 ${p(2, 5)} L ${p(2, 8)} L ${p(6, 8)}`,
    `M ${p(19, 17)} L ${p(19, 5)} A ${r} ${r} 0 0 0 ${p(17, 3)} L ${p(4, 3)}`,
  ];
};

export default (h) => scroll(h);

/** Open, the sheet shows its writing. */
export const open = (h) => [scroll(h), "M 7.75 8.5 H 11", "M 7.75 11 H 11"];
