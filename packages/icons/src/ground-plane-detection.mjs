import brackets from "./parts/media-brackets.mjs";

export default (h, s) => [
  brackets(s),
  h.poly(
    [
      [7.5, 6.75],
      [13.25, 6.75],
      [10.5, 11.25],
      [4.75, 11.25],
    ],
    { closed: true, radius: s.ease },
  ),
];
