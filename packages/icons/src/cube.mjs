/** Isometric at a 2:1 slope; inner edges meet the outline at near-sharp corners so their caps cover the join. */
const half = 6.25;
const rise = half / 2;

const box = ({ poly }, s, top, bottom) => {
  const [l, r] = [9 - half, 9 + half];
  const near = top + 2 * rise;
  const outline = poly(
    [
      [9, top],
      [r, top + rise],
      [r, bottom - rise],
      [9, bottom],
      [l, bottom - rise],
      [l, top + rise],
    ],
    {
      closed: true,
      corners: { 0: s.ease, 1: 0.5, 2: s.ease, 3: 0.5, 4: s.ease, 5: 0.5 },
    },
  );
  return `${outline} M ${l} ${top + rise} L 9 ${near} L ${r} ${top + rise} M 9 ${near} V ${bottom}`;
};

export default (h, s) => box(h, s, 2.375, 15.625);

/** The lid lifts clear of the body by one stroke and one cut. */
export const open = ({ poly }, s) => {
  const [l, r] = [9 - half, 9 + half];
  const top = 2.375;
  const lift = 2.875;
  const body = top + lift;
  return [
    poly(
      [
        [9, top],
        [r, top + rise],
        [9, top + 2 * rise],
        [l, top + rise],
      ],
      { closed: true, radius: s.ease },
    ),
    poly(
      [
        [l, body + rise],
        [9, body + 2 * rise],
        [r, body + rise],
        [r, 15.625 - rise],
        [9, 15.625],
        [l, 15.625 - rise],
      ],
      {
        closed: true,
        corners: { 0: 0.5, 1: 0.5, 2: 0.5, 3: s.ease, 4: 0.5, 5: s.ease },
      },
    ),
    `M 9 ${body + 2 * rise} V 15.625`,
  ];
};
