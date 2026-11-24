/** Dots are solid, never rings: a tag's hole, an image's sun, an eye's pupil. */
export default ({ circle }, s, cx, cy, r = s.dot) => ({
  solid: true,
  d: circle(cx, cy, r),
});
