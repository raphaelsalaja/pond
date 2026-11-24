import magnifier from "./magnifier.mjs";

/** The lens on the square keyline's upper left, the handle growing straight out of its rim. */
export default ({ circle, snap }, s) => {
  const r = 5;
  const c = s.keylines.square[0] + r;
  const start = snap(c + r * Math.SQRT1_2);
  const end = 15.25;
  return [circle(c, c, r), `M ${start} ${start} L ${end} ${end}`];
};

/** A glint shows in the lens, 1.5 clear of the rim. */
export const open = (h, s) => {
  const c = s.keylines.square[0] + 5;
  return [magnifier(h, s), h.arc(c, c, 2.25, 180, 270)];
};
