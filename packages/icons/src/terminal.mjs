const screen = ({ rect, poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.wide;
  return [
    rect(x0, y0, x1 - x0, y1 - y0, s.box),
    poly(
      [
        [5.5, 6.75],
        [7.75, 9],
        [5.5, 11.25],
      ],
      { radius: s.ease },
    ),
  ];
};

export default (h, s) => [screen(h, s), "M 9.75 11.25 H 12.5"];

/** The cursor stands up, ready to type. */
export const open = (h, s) => [screen(h, s), "M 10.75 6.75 V 11.25"];
