/** Built along its 45° axis from the tail: a slim handle flaring into the head, lens toward the top right. */
const torch = ({ poly, snap }, s, tail, size) => {
  const at = (a, b) => [
    snap(tail[0] + (a + b) * Math.SQRT1_2),
    snap(tail[1] + (b - a) * Math.SQRT1_2),
  ];
  const { waist, flare, lens, narrow, wide } = size;
  return poly(
    [
      at(0, narrow),
      at(waist, narrow),
      at(flare, wide),
      at(lens, wide),
      at(lens, -wide),
      at(flare, -wide),
      at(waist, -narrow),
      at(0, -narrow),
    ],
    {
      closed: true,
      corners: {
        0: s.ease / 2,
        1: s.ease,
        2: s.ease / 2,
        3: s.ease / 2,
        4: s.ease / 2,
        5: s.ease / 2,
        6: s.ease,
        7: s.ease / 2,
      },
    },
  );
};

export default (h, s) =>
  torch(h, s, [3.5, 14.375], {
    waist: 6.75,
    flare: 9.25,
    lens: 12.75,
    narrow: 1.75,
    wide: 3.25,
  });

export const open = (h, s) => {
  const lens = 8.75;
  const tail = [3.375, 14.625];
  const c = [tail[0] + lens * Math.SQRT1_2, tail[1] - lens * Math.SQRT1_2];
  const ray = (deg) => {
    const a = (deg * Math.PI) / 180;
    const p = (d) =>
      [h.snap(c[0] + d * Math.cos(a)), h.snap(c[1] + d * Math.sin(a))].join(
        " ",
      );
    return `M ${p(3.5)} L ${p(5.5)}`;
  };
  return [
    torch(h, s, tail, {
      waist: 4.75,
      flare: 6.25,
      lens,
      narrow: 1.5,
      wide: 2.625,
    }),
    [-90, -45, 0].map(ray),
  ];
};
