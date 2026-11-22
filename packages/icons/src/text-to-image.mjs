import { T } from "./parts/text-letter.mjs";

/** A T top left leading into a picture bottom right. */
export default ({ poly, rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const box = 8.625;
  return [
    T(x0, 8, y0, 10.375),
    rect(box, box, x1 - box, y1 - box, s.box),
    poly(
      [
        [box, 13.875],
        [11, 11.625],
        [14.375, y1],
      ],
      { radius: s.ease },
    ),
  ];
};
