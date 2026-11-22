/** The archive's lid and box, with the same measurements as archive.mjs, for icons that replace its handle. */
export const at = { top: 3, lid: 6.5, bottom: 15 };

export default ({ poly, rect }, s) => {
  const [x0, , x1] = s.keylines.wide;
  const { top, lid, bottom } = at;
  return [
    rect(x0, top, x1 - x0, lid - top, s.ease),
    poly(
      [
        [x0 + 1, lid],
        [x1 - 1, lid],
        [x1 - 1, bottom],
        [x0 + 1, bottom],
      ],
      { closed: true, corners: { 0: 0, 1: 0, 2: s.box, 3: s.box } },
    ),
  ];
};
