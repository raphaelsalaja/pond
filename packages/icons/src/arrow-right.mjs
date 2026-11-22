export default ({ poly }, s) => {
  const [x0, , x1] = s.keylines.glyph;
  return [
    `M ${x0} 9 H ${x1}`,
    poly(
      [
        [x1 - 4.5, 4.5],
        [x1, 9],
        [x1 - 4.5, 13.5],
      ],
      { radius: s.ease },
    ),
  ];
};
