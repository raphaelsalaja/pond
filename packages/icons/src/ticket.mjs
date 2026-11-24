const [y0, y1, notch] = [4.375, 13.625, 1.5];
const cy = (y0 + y1) / 2;

/** A notched side is an outer edge with box corners; the other is a tear. */
const piece = (s, a, b, notchLeft, notchRight) => {
  const R = s.box;
  const r = s.ease;
  const right = notchRight
    ? `H ${b - R} A ${R} ${R} 0 0 1 ${b} ${y0 + R} V ${cy - notch} A ${notch} ${notch} 0 0 0 ${b} ${cy + notch} V ${y1 - R} A ${R} ${R} 0 0 1 ${b - R} ${y1}`
    : `H ${b - r} A ${r} ${r} 0 0 1 ${b} ${y0 + r} V ${y1 - r} A ${r} ${r} 0 0 1 ${b - r} ${y1}`;
  const left = notchLeft
    ? `H ${a + R} A ${R} ${R} 0 0 1 ${a} ${y1 - R} V ${cy + notch} A ${notch} ${notch} 0 0 0 ${a} ${cy - notch} V ${y0 + R} A ${R} ${R} 0 0 1 ${a + R} ${y0}`
    : `H ${a + r} A ${r} ${r} 0 0 1 ${a} ${y1 - r} V ${y0 + r} A ${r} ${r} 0 0 1 ${a + r} ${y0}`;
  return `M ${a + (notchLeft ? R : r)} ${y0} ${right} ${left} Z`;
};

export default (_h, s) => {
  const [x0, , x1] = s.keylines.wide;
  return [piece(s, x0, x1, true, true), `M 11.375 ${y0} V ${y1}`];
};

/** Open, the stub tears off. */
export const open = (_h, s) => {
  const [x0, , x1] = s.keylines.wide;
  return [piece(s, x0, 10.125, true, false), piece(s, 12.625, x1, false, true)];
};
