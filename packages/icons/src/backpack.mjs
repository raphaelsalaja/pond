const pocket =
  "M 6.375 15.625 V 11.75 A 1.25 1.25 0 0 1 7.625 10.5 H 10.375 A 1.25 1.25 0 0 1 11.625 11.75 V 15.625";
const handle = "M 7 5 V 4.375 A 2 2 0 0 1 11 4.375 V 5";

const body = ({ poly }, s) =>
  poly(
    [
      [3.625, 15.625],
      [3.625, 5],
      [14.375, 5],
      [14.375, 15.625],
    ],
    { closed: true, corners: { 0: s.box, 1: s.radius, 2: s.radius, 3: s.box } },
  );

export default (h, s) => [body(h, s), handle, pocket];

/** The zip opens and the front sags into a mouth below the back rim. */
export const open = (h, s) => [
  body(h, s),
  handle,
  "M 5.5 7 Q 9 9.75 12.5 7",
  pocket,
];
