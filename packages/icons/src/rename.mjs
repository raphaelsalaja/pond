/** A text cursor standing in a field whose sides open around it. */
export default ({ poly }, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const t = 5.5;
  const b = 12.5;
  const side = (end, edge) =>
    poly(
      [
        [end, t],
        [edge, t],
        [edge, b],
        [end, b],
      ],
      { corners: { 1: s.box, 2: s.box } },
    );
  return [
    side(5.875, x0),
    side(12.125, x1),
    `M 9 ${y0 + 0.5} V ${y1 - 0.5}`,
    `M 7.75 ${y0 + 0.5} H 10.25`,
    `M 7.75 ${y1 - 0.5} H 10.25`,
  ];
};
