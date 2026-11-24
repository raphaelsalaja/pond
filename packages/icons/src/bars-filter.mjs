/** Each bar narrows by the same step on both sides. */
export default (_, s) => {
  const [lo, , hi] = s.keylines.square;
  const step = 2.25;
  return [4.75, 9, 13.25].map(
    (y, i) => `M ${lo + i * step} ${y} H ${hi - i * step}`,
  );
};
