export default ({ poly }, s) => {
  const [, y0, , y1] = s.keylines.glyph;
  return [
    `M 9 ${y0} V ${y1}`,
    poly(
      [
        [4.5, y1 - 4.5],
        [9, y1],
        [13.5, y1 - 4.5],
      ],
      { radius: s.ease },
    ),
  ];
};
