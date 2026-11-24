import { poly } from "../../helpers.mjs";

/** Two narrow `media-play` triangles side by side, a clear gap between the first tip and the second base. */
export default (s, flip = false) => {
  const [top, bottom] = [4, 14];
  const width = 5.75;
  const starts = [2.625, 9.625];
  const triangle = (a) => {
    const points = [
      [a, top],
      [a + width, (top + bottom) / 2],
      [a, bottom],
    ].map(([x, y]) => [flip ? 18 - x : x, y]);
    return poly(points, {
      closed: true,
      corners: { 0: s.ease, 1: s.ease, 2: s.ease },
    });
  };
  return starts.map(triangle);
};
