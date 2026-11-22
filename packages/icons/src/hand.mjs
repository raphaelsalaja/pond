/** Pan reads as the move cross: two axes with a head at each end. */
export default ({ poly }, s) => {
  const [lo, , hi] = s.keylines.square;
  const k = 2.25;
  const head = (points) => poly(points, { radius: s.ease });
  return [
    `M 9 ${lo} V ${hi} M ${lo} 9 H ${hi}`,
    head([
      [9 - k, lo + k],
      [9, lo],
      [9 + k, lo + k],
    ]),
    head([
      [hi - k, 9 - k],
      [hi, 9],
      [hi - k, 9 + k],
    ]),
    head([
      [9 + k, hi - k],
      [9, hi],
      [9 - k, hi - k],
    ]),
    head([
      [lo + k, 9 + k],
      [lo, 9],
      [lo + k, 9 - k],
    ]),
  ];
};
