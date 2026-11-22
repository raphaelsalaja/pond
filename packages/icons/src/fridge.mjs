const split = 7.25;

export default ({ rect }, s) => {
  const [x0, y0, x1, y1] = s.keylines.tall;
  return [rect(x0, y0, x1 - x0, y1 - y0, s.box), `M ${x0} ${split} H ${x1}`, "M 6 4.375 V 5.25 M 6 9.625 V 11.875"];
};

/** The door swings out on the right hinge in perspective, the shelf line showing inside. */
export const open = ({ rect, poly }, s) => {
  const [x0, y0, , y1] = s.keylines.tall;
  const hinge = 11;
  return [
    rect(x0, y0, hinge - x0, y1 - y0, s.box),
    `M ${x0} ${split} H ${hinge}`,
    poly(
      [
        [hinge, y0],
        [14.625, 4],
        [14.625, 14],
        [hinge, y1],
      ],
      { corners: { 1: s.ease, 2: s.ease } },
    ),
  ];
};
