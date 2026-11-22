/** Two books stand; the third leans on them, resting on one corner. */
export default ({ poly }, s) => {
  const [x0, y0, , y1] = s.keylines.square;
  const [a, b] = [6, 9.625];
  const lean = (15 * Math.PI) / 180;
  const [w, tall] = [2.5, 11];
  const foot = [12.625, y1];
  const up = [-Math.sin(lean) * tall, -Math.cos(lean) * tall];
  const side = [Math.cos(lean) * w, -Math.sin(lean) * w];
  const at = (u, v) => [foot[0] + up[0] * u + side[0] * v, foot[1] + up[1] * u + side[1] * v];
  return [
    poly(
      [
        [x0, y0],
        [a, y0],
        [a, y1],
        [x0, y1],
      ],
      { closed: true, radius: s.ease },
    ),
    poly(
      [
        [a, 3.875],
        [b, 3.875],
        [b, y1],
        [a, y1],
      ],
      { corners: { 1: s.ease, 2: s.ease } },
    ),
    poly([at(0, 0), at(1, 0), at(1, 1), at(0, 1)], { closed: true, radius: s.ease }),
  ];
};
