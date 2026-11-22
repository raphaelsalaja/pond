const capsule = (rect, s, top) => rect(6.25, top, 5.5, 7.75, 2.75);

export default ({ rect }, s) => [
  capsule(rect, s, s.keylines.tall[1]),
  "M 3.75 7 V 8 A 5.25 5.25 0 0 0 14.25 8 V 7",
  "M 9 13.25 V 15.625",
];

/** Listening: the holder opens into sound on either side. */
export const open = ({ arc, rect }, s) => [
  capsule(rect, s, 3.125),
  "M 9 10.875 V 15.625",
  arc(9, 7, 6, 145, 215),
  arc(9, 7, 6, -35, 35),
];
