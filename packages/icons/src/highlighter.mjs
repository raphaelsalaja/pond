/** Built along its 45° axis like the pencil: a chisel nib bottom left, the barrel up to the right. */
export default ({ poly }, s) => {
  const origin = [2.875, 15.875];
  const at = (a, b) => [origin[0] + (a + b) * Math.SQRT1_2, origin[1] + (b - a) * Math.SQRT1_2];
  const w = 2.25;
  const [collar, end] = [6.25, 15.25];
  return [
    poly([at(collar, -w), at(end, -w), at(end, w), at(collar, w)], {
      closed: true,
      corners: { 0: s.ease / 2, 1: s.ease, 2: s.ease, 3: s.ease / 2 },
    }),
    poly([at(collar, -1.375), at(2.25, -1.375), at(4, 1.375), at(collar, 1.375)], {
      corners: { 1: 0.5, 2: 0.5 },
    }),
  ];
};
