export default ({ rect }, s) => {
  const [x0, , x1, y1] = s.keylines.square;
  const top = 3.375;
  const head = 7.25;
  return [rect(x0, top, x1 - x0, y1 - top, s.box), `M ${x0} ${head} H ${x1}`, "M 6 2.375 V 4.75", "M 12 2.375 V 4.75"];
};

/** The bottom right page corner curls up as a filled fold. */
export const open = ({ poly }, s) => {
  const [x0, , x1, y1] = s.keylines.square;
  const top = 3.375;
  const head = 7.25;
  const curl = 3.5;
  return [
    poly(
      [
        [x0, top],
        [x1, top],
        [x1, y1 - curl],
        [x1 - curl, y1],
        [x0, y1],
      ],
      { closed: true, corners: { 0: s.box, 1: s.box, 2: s.ease / 2, 3: s.ease / 2, 4: s.box } },
    ),
    {
      d: `${poly(
        [
          [x1, y1 - curl],
          [x1 - curl, y1 - curl],
          [x1 - curl, y1],
        ],
        { radius: s.ease },
      )} Z`,
      fill: true,
    },
    `M ${x0} ${head} H ${x1}`,
    "M 6 2.375 V 4.75",
    "M 12 2.375 V 4.75",
  ];
};
