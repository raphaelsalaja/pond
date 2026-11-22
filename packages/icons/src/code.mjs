export default ({ poly }, s) => {
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
