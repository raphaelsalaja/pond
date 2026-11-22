/** The chevrons of `code` with a stroke between them, upright at rest and slanted open. */
const chevrons = (poly, s) => {
  const [x0, , x1] = s.keylines.square;
  return [
    poly(
      [
        [6.5, 4.75],
        [x0, 9],
        [6.5, 13.25],
      ],
      { radius: s.ease },
    ),
    poly(
      [
        [11.5, 4.75],
        [x1, 9],
        [11.5, 13.25],
      ],
      { radius: s.ease },
    ),
  ];
};

export default ({ poly }, s) => [chevrons(poly, s), "M 9 3.375 V 14.625"];

export const open = ({ poly }, s) => [chevrons(poly, s), "M 10.125 3.375 L 7.875 14.625"];
