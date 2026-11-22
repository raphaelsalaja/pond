export default ({ rect }, s) => {
  const [x0, , x1, y1] = s.keylines.tall;
  const top = 8;
  return [
    `M 6 ${top} V 5.625 A 3 3 0 0 1 12 5.625 V ${top}`,
    rect(x0, top, x1 - x0, y1 - top - 0.25, s.box),
    "M 9 11 V 12.75",
  ];
};

/** The shackle pivots on its right leg; the free end stops short of the body. */
export const open = ({ arc, rect }, s) => {
  const [x0, , x1, y1] = s.keylines.tall;
  const top = 8;
  return [
    `M 12 ${top} V 5.625 ${arc(9, 5.625, 3, 0, -165).replace("M", "L")}`,
    rect(x0, top, x1 - x0, y1 - top - 0.25, s.box),
    "M 9 11 V 12.75",
  ];
};
