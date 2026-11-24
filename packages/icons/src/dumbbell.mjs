const turn =
  (snap, deg) =>
  ([x, y]) => {
    const a = (deg * Math.PI) / 180;
    return [
      snap(9 + (x - 9) * Math.cos(a) - (y - 9) * Math.sin(a)),
      snap(9 + (x - 9) * Math.sin(a) + (y - 9) * Math.cos(a)),
    ];
  };

const bell = ({ poly, snap }, deg) => {
  const t = turn(snap, deg);
  const plate = (x) =>
    poly(
      [
        [x, 4.5],
        [x + 2.5, 4.5],
        [x + 2.5, 13.5],
        [x, 13.5],
      ].map(t),
      { closed: true, corners: { 0: 1.25, 1: 1.25, 2: 1.25, 3: 1.25 } },
    );
  const line = (x0, x1) => {
    const [a, b] = [t([x0, 9]), t([x1, 9])];
    return `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`;
  };
  return [
    plate(4.375),
    plate(11.125),
    line(2.375, 4.375),
    line(6.875, 11.125),
    line(13.625, 15.625),
  ];
};

export default (h) => bell(h, 0);

export const open = (h) => bell(h, -30);
