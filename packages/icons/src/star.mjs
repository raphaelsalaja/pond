export default ({ poly, starPoints }, s) =>
  poly(starPoints(9, 9.5, 7.125, 3.375), { closed: true, radius: s.radius });

/** The star shrinks and drops so rays pop out of both upper notches and above the top point. */
export const open = (h, s) => {
  const [cx, cy] = [9, 10.75];
  const ray = (deg, d0, d1) => {
    const [c, n] = [
      Math.cos((deg * Math.PI) / 180),
      Math.sin((deg * Math.PI) / 180),
    ];
    return `M ${h.snap(cx + d0 * c)} ${h.snap(cy + d0 * n)} L ${h.snap(cx + d1 * c)} ${h.snap(cy + d1 * n)}`;
  };
  return [
    h.poly(h.starPoints(cx, cy, 5.875, 2.75), {
      closed: true,
      radius: s.radius,
    }),
    ray(-54, 5, 6.5),
    ray(-126, 5, 6.5),
    ray(-90, 7.25, 8.375),
  ];
};
