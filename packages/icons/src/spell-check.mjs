import { A, top } from "./parts/text-letter.mjs";

export default ({ poly }, s) => [
  A(s.keylines.square[0], 8.875, top, 12.875),
  poly(
    [
      [10.875, 12.375],
      [12.625, 14.125],
      [15.625, 11.125],
    ],
    { radius: s.ease },
  ),
];
