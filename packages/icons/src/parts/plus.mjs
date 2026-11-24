/** The plus glyph, 4 across, placed on its host's centre. */
export default (cx, cy, arm = 2) =>
  `M ${cx - arm} ${cy} H ${cx + arm} M ${cx} ${cy - arm} V ${cy + arm}`;
