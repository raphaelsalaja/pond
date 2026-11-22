export default ({ rect }, s) => {
  const [lo, , hi] = s.keylines.square;
  const k = 5.875;
  return [rect(lo, lo, k, k, s.ease), rect(hi - k, hi - k, k, k, s.ease)];
};
