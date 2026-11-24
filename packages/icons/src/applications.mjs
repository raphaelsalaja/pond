export default ({ circle, rect }, s) => {
  const [lo, , hi] = s.keylines.square;
  const size = 5.5;
  const far = hi - size;
  return [
    rect(lo, lo, size, size, s.ease),
    rect(far, lo, size, size, s.ease),
    rect(lo, far, size, size, s.ease),
    circle(far + 2.75, far + 2.75, 2.875),
  ];
};
