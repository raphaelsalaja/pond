import box from "./parts/files-archive.mjs";

export default (h, s) => [
  box(h, s),
  "M 9 8.75 V 12.75",
  h.poly(
    [
      [7, 10.75],
      [9, 12.75],
      [11, 10.75],
    ],
    { radius: s.ease },
  ),
];
