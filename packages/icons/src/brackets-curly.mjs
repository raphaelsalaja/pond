export default ({ poly }, s) => {
  const [, y0, , y1] = s.keylines.square;
  const t = y0 + 0.5;
  const b = y1 - 0.5;
  const brace = (end, arm, tip) =>
    poly(
      [
        [end, t],
        [arm, t],
        [arm, 7.625],
        [tip, 9],
        [arm, 10.375],
        [arm, b],
        [end, b],
      ],
      { radius: s.ease, corners: { 1: 1.75, 5: 1.75 } },
    );
  return [brace(6.875, 4.875, 3.125), brace(11.125, 13.125, 14.875)];
};
