import magnifier from "./magnifier.mjs";

/** The lens on the square keyline's upper left, the handle heavier and clear of the lens. */
export default ({ circle, snap }, s) => {
  const r = 5;
  const c = s.keylines.square[0] + r;
  const start = snap(c + (r + s.cut) * Math.SQRT1_2);
  const end = 15;
  return [
    circle(c, c, r),
    { d: `M ${start} ${start} L ${end} ${end}`, width: s.handle },
  ];
};

/** A glint shows in the lens, 1.5 clear of the rim. */
export const open = (h, s) => {
  const c = s.keylines.square[0] + 5;
  return [magnifier(h, s), h.arc(c, c, 2.25, 180, 270)];
};
