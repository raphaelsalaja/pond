/** An eight-lobed seal; every turn is named so the short scallops keep a soft radius. */
export default ({ poly, starPoints }, s) => {
  const pts = starPoints(9, 9, 7.125, 5.875, 8);
  const corners = Object.fromEntries(pts.map((_, i) => [i, i % 2 ? 1 : 1.5]));
  return [
    poly(pts, { closed: true, corners }),
    poly(
      [
        [6.375, 9.125],
        [8.25, 11],
        [11.75, 7.5],
      ],
      { radius: s.ease },
    ),
  ];
};
