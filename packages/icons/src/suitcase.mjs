const case_ = ({ rect }, s, top) => {
  const [x0, , x1] = s.keylines.tall;
  const bottom = 14.125;
  return [rect(x0, top, x1 - x0, bottom - top, s.box), `M 5.625 ${bottom} V 15.625 M 12.375 ${bottom} V 15.625`];
};

const handle = ({ poly }, s, l, r, foot) =>
  poly(
    [
      [l, foot],
      [l, 2.375],
      [r, 2.375],
      [r, foot],
    ],
    { radius: s.ease },
  );

export default (h, s) => [case_(h, s, 5.125), handle(h, s, 7, 11, 5.125), "M 6.75 8 V 11.25 M 11.25 8 V 11.25"];

/** The trolley handle pulls out. */
export const open = (h, s) => [case_(h, s, 7.625), handle(h, s, 7.25, 10.75, 7.625), "M 6.75 10.25 V 11.5 M 11.25 10.25 V 11.5"];
