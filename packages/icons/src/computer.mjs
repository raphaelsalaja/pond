const monitor = (rect, s) => {
  const [x0, y0, x1, y1] = s.keylines.square;
  const bottom = 11.875;
  return [
    rect(x0, y0, x1 - x0, bottom - y0, s.box),
    `M 9 ${bottom} V ${y1}`,
    `M 6.25 ${y1} H 11.75`,
  ];
};

export default ({ rect }, s) => monitor(rect, s);

/** Awake: a window lights up on the screen. */
export const open = ({ rect }, s) => [
  monitor(rect, s),
  rect(5.5, 5.125, 7, 3.5, s.ease),
];
