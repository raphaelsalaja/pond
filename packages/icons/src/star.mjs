import star from "./star.mjs";

export default ({ poly, starPoints }, s) => poly(starPoints(9, 9.5, 7.125, 3.375), { closed: true, radius: s.radius });

/** Rays pop out of the two upper notches, 1.25 clear of the star's edges. */
export const open = (h, s) => {
  const ray = (deg) => {
    const [c, n] = [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
    return `M ${h.snap(9 + 6.25 * c)} ${h.snap(9.5 + 6.25 * n)} L ${h.snap(9 + 7.5 * c)} ${h.snap(9.5 + 7.5 * n)}`;
  };
  return [star(h, s), ray(-54), ray(-126)];
};
