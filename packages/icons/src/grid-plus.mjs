import badge from "./parts/badge.mjs";

/** The grid's bottom right cell gives way to the badge. */
export default ({ rect }, s) => {
  const [lo, , hi] = s.keylines.square;
  const size = 5.5;
  const far = hi - size;
  return [
    rect(lo, lo, size, size, s.ease),
    rect(far, lo, size, size, s.ease),
    rect(lo, far, size, size, s.ease),
    badge("plus"),
  ];
};
