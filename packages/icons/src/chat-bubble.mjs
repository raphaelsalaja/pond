import bubble from "./chat-bubble.mjs";
import dot from "./parts/dot.mjs";

export default ({ poly }, s) => {
  const [x0, , x1] = s.keylines.square;
  const top = 3;
  const base = 13;
  return poly(
    [
      [x0, top],
      [x1, top],
      [x1, base],
      [8.75, base],
      [5.5, 15.625],
      [5.5, base],
      [x0, base],
    ],
    {
      closed: true,
      corners: {
        0: s.box,
        1: s.box,
        2: s.box,
        3: s.ease / 2,
        4: s.ease / 2,
        5: 0,
        6: s.box,
      },
    },
  );
};

export const open = (h, s) => [
  bubble(h, s),
  [5.75, 9, 12.25].map((x) => dot(h, s, x, 8, 1)),
];
