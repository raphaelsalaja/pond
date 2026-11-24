const seams = "M 4.75 8.25 V 13.25 M 13.25 8.25 V 13.25";
const left = [
  [4.75, 15.625],
  [4.75, 13.25],
  [2.375, 13.25],
  [2.375, 5.375],
  [5.375, 2.375],
  [7, 2.375],
];
const right = left.map(([x, y]) => [18 - x, y]).reverse();

export default ({ poly }) => [
  poly([...left, [9, 4.375], ...right], { closed: true, radius: 1.25 }),
  "M 9 4.375 V 15.625",
  seams,
];

export const open = ({ poly }) => [
  poly([...left, [7, 15.625]], { closed: true, radius: 1.25 }),
  poly([[11, 15.625], ...right], { closed: true, radius: 1.25 }),
  seams,
];
