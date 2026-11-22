/** Built along its 45° axis: three parallel wires, a wide bend at the bottom left and a tight one at the top right. */
const L = 14.25;
const gap = 2.5;
const at = ({ pt }, u, v) => {
  const k = Math.SQRT1_2;
  return pt([9 + (u - L / 2) * k + v * k, 9 - (u - L / 2) * k + v * k]);
};

const loops = (h, end) =>
  `L ${at(h, gap, -gap)} A ${gap} ${gap} 0 0 0 ${at(h, gap, gap)} L ${at(h, L - gap / 2, gap)} A ${gap / 2} ${gap / 2} 0 0 0 ${at(h, L - gap / 2, 0)} L ${at(h, end, 0)}`;

export default (h) => `M ${at(h, L - 3.5, -gap)} ${loops(h, 5.5)}`;

export const open = (h) => {
  const k = Math.SQRT1_2;
  const foot = [9 + (gap - L / 2) * k - gap * k, 9 - (gap - L / 2) * k - gap * k];
  return `M ${h.pt([foot[0], foot[1] - 6.5])} ${loops(h, 5.5)}`;
};
