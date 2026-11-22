export default ({ rect }, s) => {
  const [lo, , hi] = s.keylines.square;
  const size = 5.5;
  const far = hi - size;
  return [lo, far].flatMap((y) => [lo, far].map((x) => rect(x, y, size, size, s.ease)));
};
