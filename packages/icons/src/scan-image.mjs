import dot from "./parts/dot.mjs";
import brackets from "./parts/media-brackets.mjs";

export default (h, s) => [
  brackets(s),
  h.poly(
    [
      [5.5, 12.25],
      [8.5, 9.25],
      [11.5, 12.25],
    ],
    { radius: s.ease },
  ),
  dot(h, s, 11.5, 6.5),
];
