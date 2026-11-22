export default ({ poly }, s) => {
  const [x0, , x1] = s.keylines.glyph;
  return [
    `M ${x1} 9 H ${x0}`,
    poly(
      [
        [x0 + 4.5, 4.5],
        [x0, 9],
        [x0 + 4.5, 13.5],
      ],
      { radius: s.ease },
    ),
  ];
};
