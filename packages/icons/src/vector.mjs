/** Two anchor handles joined by the curve they shape. */
export default ({ rect }, s) => {
  const [lo, , hi] = s.keylines.square;
  const k = 3.5;
  const near = lo + k / 2;
  const far = hi - k;
  return [
    rect(lo, far, k, k, 1),
    rect(far, lo, k, k, 1),
    `M ${near} ${far} A ${far - near} ${far - near} 0 0 1 ${far} ${near}`,
  ];
};
