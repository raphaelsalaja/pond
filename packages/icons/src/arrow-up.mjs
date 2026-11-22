export default ({ poly }, s) => {
  const [, y0, , y1] = s.keylines.glyph;
  return [
    `M 9 ${y1} V ${y0}`,
    poly(
      [
        [4.5, y0 + 4.5],
        [9, y0],
        [13.5, y0 + 4.5],
      ],
      { radius: s.ease },
    ),
  ];
};
